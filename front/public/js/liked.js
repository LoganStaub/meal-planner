// Star ratings on the Liked page.
// Clicking a star saves this user's rating (PUT /api/me/ratings/:id).
// Clicking the star you already picked removes your rating (DELETE).
// The summary shows the recipe's anonymous average from the server.

function renderStars(obj_rating, nRating) {
  obj_rating.dataset.myRating = String(nRating);
  obj_rating.querySelectorAll(".star").forEach(function (obj_star) {
    const nValue = Number(obj_star.dataset.value);
    obj_star.classList.toggle("on", nValue <= nRating);
    obj_star.setAttribute("aria-checked", String(nValue === nRating));
  });
}

function renderSummary(obj_rating, average, count) {
  obj_rating.querySelector(".rating-summary").textContent =
    count > 0 ? `${average.toFixed(1)} · ${count} rating${count === 1 ? "" : "s"}` : "No ratings yet";
}

document.querySelectorAll(".rating").forEach(function (obj_rating) {
  const recipeId = obj_rating.dataset.recipeId;

  obj_rating.addEventListener("click", async function (event) {
    const obj_star = event.target.closest(".star");
    if (!obj_star || obj_rating.classList.contains("saving")) return;

    const nPrevious = Number(obj_rating.dataset.myRating);
    const nClicked = Number(obj_star.dataset.value);
    const bRemove = nClicked === nPrevious;

    // Update right away, and undo if saving fails
    renderStars(obj_rating, bRemove ? 0 : nClicked);
    obj_rating.classList.add("saving");

    try {
      const response = await fetch(`/api/me/ratings/${encodeURIComponent(recipeId)}`, {
        method: bRemove ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: bRemove ? undefined : JSON.stringify({ rating: nClicked }),
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const result = await response.json();
      renderStars(obj_rating, result.my_rating || 0);
      renderSummary(obj_rating, result.average, result.count);
    } catch (error) {
      console.error("Could not save rating:", error);
      renderStars(obj_rating, nPrevious);
    } finally {
      obj_rating.classList.remove("saving");
    }
  });
});
