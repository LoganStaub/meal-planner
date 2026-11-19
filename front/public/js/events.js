// Logs what the user does, for the OKR numbers on the admin page:
//   logEvent("add_to_calendar_started", { entry_point: "home_card", recipe_id: 3 })
//
// Sends POST /api/events (back/src/routes/events.js). The server only accepts
// the names in CLIENT_EVENTS (back/src/events.js) and knows who is logged in
// from the session, so no user id is sent.
//
// Fire and forget: it never throws and never waits, so tracking can't get in
// the way of what the user is doing. keepalive lets the request finish even
// when the page is leaving (e.g. a click on a link).

window.logEvent = function logEvent(eventName, metadata = {}) {
    try {
        fetch("/api/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_name: eventName, metadata }),
            keepalive: true,
        }).catch((error) => console.warn(`Could not log ${eventName}:`, error));
    } catch (error) {
        console.warn(`Could not log ${eventName}:`, error);
    }
};
