using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Office.Server.Reports;
using Xunit;

namespace Office.Server.Tests;

public class ReportConnectionsTests
{
    private static IConfiguration Config(string? reports1C) => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Reports1C"] = reports1C })
        .Build();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Reports1C_IsNotConfigured_WhenStringIsMissing(string? value)
    {
        Assert.Null(ReportConnections.Reports1C(Config(value)));
    }

    [Fact]
    public void Reports1C_TrustsServerCertificate_ForStringCopiedFromOldPortal()
    {
        // Ровно такая строка лежит в конфиге: из старого портала на EF Core 5, без флагов TLS.
        var result = ReportConnections.Reports1C(Config(
            "Data Source=db2-serv2c\\SQL2019; Initial Catalog=SQL_BASE_Reports_1c; User ID=UserFor1C; Password=secret"));

        var builder = new SqlConnectionStringBuilder(result);
        Assert.True(builder.TrustServerCertificate);
        Assert.Equal("db2-serv2c\\SQL2019", builder.DataSource);
        Assert.Equal("SQL_BASE_Reports_1c", builder.InitialCatalog);
        Assert.Equal("UserFor1C", builder.UserID);
        Assert.Equal("secret", builder.Password);
    }

    [Theory]
    [InlineData("TrustServerCertificate=False")]
    [InlineData("Trust Server Certificate=false")]
    public void Reports1C_KeepsExplicitTrustSetting(string explicitSetting)
    {
        var result = ReportConnections.Reports1C(Config($"Data Source=db; Initial Catalog=x; {explicitSetting}"));

        Assert.False(new SqlConnectionStringBuilder(result).TrustServerCertificate);
    }
}
