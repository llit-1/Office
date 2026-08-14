using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.KnowledgeLibrary;

public sealed class KnowledgeLibraryIndexQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>();
    private readonly object _gate = new();
    private readonly HashSet<Guid> _pending = [];
    private readonly HashSet<Guid> _rerunRequested = [];

    public void Request(Guid sectionId)
    {
        lock (_gate)
        {
            if (!_pending.Add(sectionId))
            {
                _rerunRequested.Add(sectionId);
                return;
            }
            _channel.Writer.TryWrite(sectionId);
        }
    }

    internal IAsyncEnumerable<Guid> ReadAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);

    internal void Complete(Guid sectionId)
    {
        lock (_gate)
        {
            if (_rerunRequested.Remove(sectionId))
            {
                _channel.Writer.TryWrite(sectionId);
                return;
            }
            _pending.Remove(sectionId);
        }
    }
}

public sealed class KnowledgeLibraryIndexWorker(
    IServiceScopeFactory scopeFactory,
    KnowledgeLibraryIndexQueue queue,
    ILogger<KnowledgeLibraryIndexWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await EnqueueAllActiveSections(stoppingToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Knowledge index worker could not load sections at startup. It will retry on schedule.");
        }
        var periodicTask = EnqueuePeriodically(stoppingToken);

        try
        {
            await foreach (var sectionId in queue.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await using var scope = scopeFactory.CreateAsyncScope();
                    var indexer = scope.ServiceProvider.GetRequiredService<KnowledgeLibraryIndexer>();
                    await indexer.IndexSectionAsync(sectionId, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Unexpected knowledge indexing error for section {SectionId}.", sectionId);
                }
                finally
                {
                    queue.Complete(sectionId);
                }
            }
        }
        finally
        {
            await periodicTask;
        }
    }

    private async Task EnqueuePeriodically(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));
        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                try
                {
                    await EnqueueAllActiveSections(cancellationToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Knowledge index worker could not load sections for a scheduled run.");
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private async Task EnqueueAllActiveSections(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<RKNETDBContext>();
        var ids = await db.OfficeKnowledgeSections
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);
        foreach (var id in ids)
            queue.Request(id);
    }
}
