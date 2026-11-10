using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Routing;
using Office.Server.Controllers;
using Xunit;

namespace Office.Server.Tests;

public class DeliveryRequestsRolesTests
{
    private static readonly string[] OpenToMenu = [nameof(DeliveryRequestsController.GetLocations), nameof(DeliveryRequestsController.MenuImport)];

    private static string[] Roles(MemberInfo member) =>
        member.GetCustomAttributes<AuthorizeAttribute>().SelectMany(x => x.Roles?.Split(',') ?? []).ToArray();

    [Fact]
    public void MenuSectionCanOnlyListPointsAndImportMenu()
    {
        Assert.Contains("MenuMarketing", Roles(typeof(DeliveryRequestsController)));

        var actions = typeof(DeliveryRequestsController)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(x => x.GetCustomAttributes<HttpMethodAttribute>().Any())
            .ToList();
        Assert.NotEmpty(actions);

        foreach (var action in actions)
        {
            var roles = Roles(action);
            if (OpenToMenu.Contains(action.Name))
            {
                Assert.Empty(roles);
            }
            else
            {
                Assert.Equal(["DeliveryRequests", "MenuAdmin"], roles);
            }
        }
    }
}
