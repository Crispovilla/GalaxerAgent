using Microsoft.AspNetCore.SignalR;

namespace Base_MVC_Core9.Hubs;

public class ConstellationHub : Hub
{
    public async Task JoinSession(string sessionId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, sessionId);
    }
}