// The recipe page (views/recipe.ejs): the Like button, Add to meal plan and
// Keep screen on. The rest of the page is drawn by the server.

(() => {
    const recipeElement = document.getElementById("recipe");
    if (!recipeElement) return;

    const recipe = {
        recipe_id: Number(recipeElement.dataset.recipeId),
        recipe_title: recipeElement.dataset.recipeTitle,
        recipe_class_desc: recipeElement.dataset.mealType,
    };

    // Logged out in another tab: log in again, then come back here
    function goToLogin() {
        location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    }

    // The shared popup (js/plan-dialog.js). "recipe_details" is the entry
    // point name the OKR numbers have used for this button since it lived in
    // the old recipe window, so the numbers stay comparable.
    document.getElementById("recipe-plan").addEventListener("click", () => {
        PlanDialog.open(recipe, { entryPoint: "recipe_details" });
    });

    // Likes are saved per user: PUT likes a recipe, DELETE unlikes it.
    // The button flips right away, and flips back if saving fails.
    const likeButton = document.getElementById("recipe-like");
    const likeText = document.getElementById("recipe-like-text");

    function showLike(liked) {
        likeButton.setAttribute("aria-pressed", String(liked));
        likeButton.title = liked ? "Remove from your liked recipes" : "Add to your liked recipes";
        likeText.textContent = liked ? "Liked" : "Like";
    }

    likeButton.addEventListener("click", async () => {
        const liked = likeButton.getAttribute("aria-pressed") !== "true";
        showLike(liked);
        try {
            const response = await fetch(`/api/me/likes/${encodeURIComponent(recipe.recipe_id)}`, {
                method: liked ? "PUT" : "DELETE",
            });
            if (response.status === 401) {
                goToLogin();
                return;
            }
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
        } catch (error) {
            console.error("Could not save like:", error);
            showLike(!liked);
        }
    });

    // ---------- Keep screen on ----------
    // Uses the browser's Screen Wake Lock API, which needs HTTPS (localhost
    // counts). The browser drops the lock whenever the page is hidden
    // (another tab or app, or the phone locked), so it's asked for again when
    // the page comes back. Leaving the recipe turns it off.

    const wakeButton = document.getElementById("recipe-wake");
    const wakeText = document.getElementById("recipe-wake-text");
    const wakeNote = document.getElementById("recipe-wake-note");

    if ("wakeLock" in navigator) {
        // What the user chose, and the lock we're holding right now (if any)
        let wantAwake = false;
        let wakeLock = null;

        function showWake(on) {
            wakeButton.setAttribute("aria-checked", String(on));
            wakeText.textContent = on ? "Screen stays on" : "Keep screen on";
        }

        function showWakeNote(text) {
            wakeNote.textContent = text;
            wakeNote.hidden = !text;
        }

        async function lockScreen() {
            try {
                wakeLock = await navigator.wakeLock.request("screen");
                wakeLock.addEventListener("release", () => { wakeLock = null; });
                return true;
            } catch (error) {
                // e.g. the phone is in low-power mode
                console.error("Could not keep the screen on:", error);
                return false;
            }
        }

        async function turnOn() {
            wantAwake = true;
            showWake(true);
            showWakeNote("");
            if (!(await lockScreen())) {
                wantAwake = false;
                showWake(false);
                showWakeNote("Couldn't keep the screen on. Your device may be in low-power mode.");
            }
        }

        function turnOff() {
            wantAwake = false;
            showWake(false);
            wakeLock?.release().catch(() => {});
            wakeLock = null;
        }

        wakeButton.hidden = false;
        wakeButton.addEventListener("click", () => (wantAwake ? turnOff() : turnOn()));

        document.addEventListener("visibilitychange", () => {
            if (wantAwake && !wakeLock && document.visibilityState === "visible") turnOn();
        });

        // Leaving the recipe turns it off, so it doesn't come back on by
        // itself if the browser later restores this page from its cache
        window.addEventListener("pagehide", turnOff);
    }
})();
