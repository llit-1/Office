using Office.Server.VideoDevices;
using Xunit;

namespace Office.Server.Tests;

public sealed class AdbPublicKeysTests
{
    /// <summary>Структура ключа Android: первые 4 байта — длина модуля в словах (64), всего 524 байта.</summary>
    private static string Body(int words = 64, int size = AdbPublicKeys.KeyStructSize)
    {
        var bytes = new byte[size];
        new Random(1).NextBytes(bytes);
        if (size >= 4)
        {
            BitConverter.GetBytes(words).CopyTo(bytes, 0);
        }

        return Convert.ToBase64String(bytes);
    }

    [Fact]
    public void Normalize_AcceptsKeyWithComment()
    {
        var body = Body();
        Assert.Equal($"{body} vasiliy@PC4", AdbPublicKeys.Normalize($"  {body}   vasiliy@PC4 \n".TrimEnd('\n')));
        Assert.Equal(body, AdbPublicKeys.Normalize(body));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-base64!!! user@host")]
    public void Normalize_RejectsGarbage(string? value) => Assert.Null(AdbPublicKeys.Normalize(value));

    [Fact]
    public void Normalize_RejectsWrongStructure()
    {
        Assert.Null(AdbPublicKeys.Normalize(Body(words: 32)));
        Assert.Null(AdbPublicKeys.Normalize(Body(size: 256)));
    }

    [Theory]
    [InlineData("a\nb")]
    [InlineData("x;reboot")]
    [InlineData("$(id)")]
    [InlineData("'quote'")]
    [InlineData("Василий@PC4")]
    public void Normalize_DropsUnsafeComments(string comment)
    {
        var expected = comment.Contains('\n') ? null : Body();
        Assert.Equal(expected, AdbPublicKeys.Normalize($"{Body()} {comment}"));
    }
}
