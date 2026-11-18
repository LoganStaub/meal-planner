
        // "Tonight's picks" changes with the time of day, using the visitor's
        // own clock (the server might be in another time zone)
        function picksTimeOfDay(date = new Date()) {
            const hour = date.getHours();
            if (hour >= 4 && hour < 11) return "this morning's";
            if (hour >= 11 && hour < 17) return "this afternoon's";
            return "tonight's";
        }

        function showPicksTimeOfDay() {
            const when = picksTimeOfDay();
            document.getElementById("picks-label").textContent =
                `${when.charAt(0).toUpperCase()}${when.slice(1)} picks`;
            document.getElementById("done-picks-when").textContent = when;
        }
        showPicksTimeOfDay();

        // The day's picks come from GET /api/me/daily-picks (routes/dailyPicks.js):
        // 5 recipes that change at midnight, each with this user's like state,
        // rating and pantry info already included. LoadDailyPicks() at the bottom
        // of this file fills the list in.
        let meals = [];
        let nCurrent = 0;
        // true once LoadDailyPicks() has the picks
        let bRecipesLoaded = false;
        let bAnimating = false;

        const obj_stage = document.getElementById("stage");
        const obj_slide = document.getElementById("slide");
        const obj_photo = document.getElementById("meal-photo");
        const obj_done = document.getElementById("done");
        const obj_progress = document.getElementById("progress");
        const obj_like = document.getElementById("like-btn");
        // The shared profile menu (partials/profile-menu.ejs, js/profile-menu.js)
        const obj_profileMenu = document.getElementById("profile-menu");
        const obj_prevArrow = document.getElementById("prev-arrow");
        const obj_nextArrow = document.getElementById("next-arrow");

        const bReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // the card stays hidden until the picks arrive, so it never shows empty
        obj_slide.style.visibility = "hidden";


        // Called once the picks have loaded: one progress bar segment per meal,
        // and start downloading every photo now so swiping doesn't wait on them
        function SetUpMeals() {
            obj_progress.replaceChildren();
            meals.forEach(function(meal) {
                obj_progress.appendChild(document.createElement("span"));
                if (meal.image_url) new Image().src = meal.image_url;
            });
            document.getElementById("done-count").textContent = meals.length;
        }

        // if a photo can't load, hide it and let the slide's gradient background show
        obj_photo.addEventListener("error", function() { obj_photo.classList.add("broken"); });
        obj_photo.addEventListener("load", function() { obj_photo.classList.remove("broken"); });


        // fills the card with the current meal's data
        function RenderMeal() {
            const meal = meals[nCurrent];

            // a recipe with no photo yet shows the slide's gradient background
            if (meal.image_url) {
                obj_photo.src = meal.image_url;
                obj_photo.classList.remove("broken");
            } else {
                obj_photo.removeAttribute("src");
                obj_photo.classList.add("broken");
            }
            obj_photo.alt = meal.recipe_title;
            document.getElementById("meal-time").textContent = `${meal.prep_time} min`;
            document.getElementById("meal-tag").textContent = meal.recipe_class_desc;
            document.getElementById("meal-title").textContent = meal.recipe_title;
            document.getElementById("meal-desc").textContent = meal.description;

            RenderLike();
            RenderPantry();
            RenderRating();
            RenderSavePrompt();
            RenderProgress(nCurrent + 1);
        }

        // fills the progress bars up to the current meal, and shows "2 of 5"
        function RenderProgress(nShown) {
            [...obj_progress.children].forEach(function(obj_bar, i) {
                obj_bar.classList.toggle("filled", i < nShown);
            });
            document.getElementById("picks-count").textContent = `${Math.min(nShown, meals.length)} of ${meals.length}`;

            // nothing before the first meal, nothing after the "all caught up" screen
            obj_prevArrow.disabled = nShown <= 1;
            obj_nextArrow.disabled = !obj_done.hidden;
        }

        // true once the picks have loaded and this meal is a real recipe in the database
        function HasRealRecipe(meal) {
            return bRecipesLoaded && meal.recipe_id != null;
        }

        function RenderLike() {
            const meal = meals[nCurrent];
            obj_like.setAttribute("aria-pressed", String(Boolean(meal.liked)));
            // a meal that isn't in the database can't be liked or planned
            const bMissing = bRecipesLoaded && meal.recipe_id == null;
            const sMissing = bMissing ? "This recipe isn't in the database yet" : "";
            obj_like.disabled = bMissing;
            obj_like.title = sMissing;
            const obj_calendar = document.getElementById("calendar-btn");
            obj_calendar.disabled = bMissing;
            obj_calendar.title = sMissing;
        }

        // What this user already has for the recipe, from their own pantry, and
        // how many ingredients they'd need to buy. Hidden for recipes with no
        // ingredients listed.
        function RenderPantry() {
            const meal = meals[nCurrent];
            const obj_pill = document.getElementById("meal-pantry-pill");
            const obj_items = document.getElementById("meal-pantry");
            const obj_buy = document.getElementById("meal-buy");
            obj_pill.hidden = !bRecipesLoaded || !(meal.ingredient_count > 0);
            if (obj_pill.hidden) return;

            const bHaveSome = meal.in_pantry.length > 0;
            obj_items.textContent = bHaveSome ? meal.in_pantry.join(", ") : "Nothing yet";
            obj_items.classList.toggle("empty", !bHaveSome);
            obj_buy.textContent = meal.to_buy > 0 ? `+${meal.to_buy} to buy` : "Have it all";
            obj_buy.classList.toggle("all", meal.to_buy === 0);
        }

        // The recipe's average rating from everyone, e.g. "★ 4.3 (12)".
        // Hidden until the picks load, so it doesn't flash "No ratings yet".
        function RenderRating() {
            const meal = meals[nCurrent];
            const obj_wrap = document.getElementById("meal-rating-wrap");
            const obj_rating = document.getElementById("meal-rating");
            obj_wrap.hidden = !bRecipesLoaded;
            if (!bRecipesLoaded) return;

            if (meal.rating_count > 0) {
                const average = meal.rating_avg.toFixed(1);
                const ratings = `${meal.rating_count} rating${meal.rating_count === 1 ? "" : "s"}`;
                obj_rating.innerHTML = `<span class="star" aria-hidden="true">★</span> ${average} (${meal.rating_count})`;
                obj_rating.setAttribute("aria-label", `Rated ${average} out of 5 from ${ratings}`);
            } else {
                obj_rating.textContent = "No ratings yet";
                obj_rating.removeAttribute("aria-label");
            }
        }


        // moves to the next (+1) or previous (-1) meal with a slide animation.
        // nFromX is where the card was dragged to, so the animation continues from there.
        async function GoTo(nDirection, nFromX = 0) {
            if (meals.length === 0) return;
            if (bAnimating || !obj_profileMenu.hidden || obj_plan.open || obj_mealFit.open) return;

            // from the "all caught up" screen, going back shows the last meal again
            if (!obj_done.hidden) {
                if (nDirection === -1) {
                    obj_done.hidden = true;
                    RenderMeal();
                    await SlideIn(-1);
                }
                return;
            }

            const nTarget = nCurrent + nDirection;
            if (nTarget < 0) {
                SnapBack(nFromX);
                return;
            }

            bAnimating = true;
            await SlideOut(nDirection, nFromX);

            if (nTarget >= meals.length) {
                obj_done.hidden = false;
                RenderProgress(meals.length);
                obj_slide.style.transform = "";
                obj_slide.style.opacity = "";
                bAnimating = false;
                MaybeAskMealFit();
                return;
            }

            nCurrent = nTarget;
            RenderMeal();
            await SlideIn(nDirection);
            bAnimating = false;
        }

        function SlideOut(nDirection, nFromX) {
            const sEnd = `translateX(${-nDirection * obj_stage.clientWidth}px)`;
            const animation = obj_slide.animate(
                [{ transform: `translateX(${nFromX}px)`, opacity: 1 }, { transform: sEnd, opacity: 0 }],
                { duration: bReducedMotion ? 0 : 220, easing: "ease-in" }
            );
            // keep the card off-screen once the animation ends
            obj_slide.style.transform = sEnd;
            obj_slide.style.opacity = "0";
            return animation.finished;
        }

        function SlideIn(nDirection) {
            obj_slide.style.transform = "";
            obj_slide.style.opacity = "";
            return obj_slide.animate(
                [{ transform: `translateX(${nDirection * obj_stage.clientWidth * 0.35}px)`, opacity: 0 },
                 { transform: "translateX(0)", opacity: 1 }],
                { duration: bReducedMotion ? 0 : 260, easing: "ease-out" }
            ).finished;
        }

        // drag wasn't far enough: return the card to the middle
        function SnapBack(nFromX) {
            obj_slide.style.transform = "";
            obj_slide.animate(
                [{ transform: `translateX(${nFromX}px)` }, { transform: "translateX(0)" }],
                { duration: bReducedMotion ? 0 : 200, easing: "ease-out" }
            );
        }


        // ---------- Swiping (touch and mouse) ----------
        let objDrag = null;
        let bSuppressClick = false;

        obj_stage.addEventListener("pointerdown", function(event) {
            if (event.button !== 0 || bAnimating || !obj_done.hidden) return;
            // the action buttons and header are for tapping, not dragging
            if (event.target.closest(".card-actions, .save-prompt, .app-header, .stage-arrows")) return;

            objDrag = { nId: event.pointerId, nStartX: event.clientX, nStartY: event.clientY, nDx: 0, bMoved: false };
        });

        obj_stage.addEventListener("pointermove", function(event) {
            if (!objDrag || event.pointerId !== objDrag.nId) return;

            const nDx = event.clientX - objDrag.nStartX;
            const nDy = event.clientY - objDrag.nStartY;

            // only start dragging once the pointer clearly moves sideways,
            // so taps still open the recipe and vertical scrolling still works
            if (!objDrag.bMoved) {
                if (Math.abs(nDx) < 8 || Math.abs(nDx) < Math.abs(nDy)) return;
                objDrag.bMoved = true;
                obj_stage.setPointerCapture(event.pointerId);
                obj_slide.classList.add("dragging");
            }

            objDrag.nDx = nDx;
            obj_slide.style.transform = `translateX(${nDx}px)`;
        });

        function EndDrag(event) {
            if (!objDrag || event.pointerId !== objDrag.nId) return;
            const { bMoved, nDx } = objDrag;
            objDrag = null;
            if (!bMoved) return;

            obj_slide.classList.remove("dragging");
            bSuppressClick = true;
            setTimeout(function() { bSuppressClick = false; }, 0);

            if (Math.abs(nDx) > obj_stage.clientWidth * 0.2) {
                GoTo(nDx < 0 ? 1 : -1, nDx);
            } else {
                SnapBack(nDx);
            }
        }

        obj_stage.addEventListener("pointerup", EndDrag);
        obj_stage.addEventListener("pointercancel", EndDrag);

        // arrow keys on a computer
        document.addEventListener("keydown", function(event) {
            if (event.key === "ArrowRight") GoTo(1);
            if (event.key === "ArrowLeft") GoTo(-1);
        });


        // ---------- Buttons ----------

        // X skips to the next meal
        document.getElementById("next-btn").addEventListener("click", function() {
            GoTo(1);
        });

        // arrows on a computer
        obj_prevArrow.addEventListener("click", function() { GoTo(-1); });
        obj_nextArrow.addEventListener("click", function() { GoTo(1); });

        // Likes are saved per user: PUT likes a recipe, DELETE unlikes it.
        // The button flips right away, and flips back if saving fails.
        obj_like.addEventListener("click", async function() {
            const meal = meals[nCurrent];
            // wait for the real recipe id, so a like never lands on the wrong recipe
            if (!HasRealRecipe(meal)) return;
            const bLiked = !meal.liked;
            meal.liked = bLiked;
            RenderLike();

            try {
                // ?source=discover: the server logs the save as recipe_saved for OKR 1
                const sQuery = bLiked ? "?source=discover" : "";
                const response = await fetch(`/api/me/likes/${encodeURIComponent(meal.recipe_id)}${sQuery}`, {
                    method: bLiked ? "PUT" : "DELETE"
                });
                if (!response.ok) throw new Error(`Request failed (${response.status})`);
                // ask "Would you actually make this?" once per recipe, only after
                // the save went through, so the answer is logged after recipe_saved
                meal.bAskIntent = bLiked && !meal.sIntentAnswer;
                if (meals[nCurrent] === meal) RenderSavePrompt();
            } catch (error) {
                console.error("Could not save like:", error);
                meal.liked = !bLiked;
                if (meals[nCurrent] === meal) RenderLike();
            }
        });

        // ---------- "Would you actually make this?" (OKR 1) ----------
        // Shown on a meal right after it's saved, and again if the user swipes
        // away and comes back without answering. The answer is logged as
        // save_intent_answered; db/queries/okr1_discover_save.sql counts it.
        const obj_savePrompt = document.getElementById("save-prompt");
        const obj_savePromptText = document.getElementById("save-prompt-text");
        const obj_savePromptActions = document.getElementById("save-prompt-actions");
        const sSavePromptHtml = obj_savePromptText.innerHTML;
        let nThanksTimer = null;

        function RenderSavePrompt() {
            clearTimeout(nThanksTimer);
            const meal = meals[nCurrent];
            obj_savePromptText.innerHTML = sSavePromptHtml;
            obj_savePromptActions.hidden = false;
            obj_savePrompt.hidden = !(meal.bAskIntent && meal.liked);
        }

        obj_savePromptActions.addEventListener("click", function(event) {
            const obj_button = event.target.closest("[data-answer]");
            if (!obj_button) return;
            const meal = meals[nCurrent];
            meal.sIntentAnswer = obj_button.dataset.answer;
            meal.bAskIntent = false;
            window.logEvent("save_intent_answered", { recipe_id: meal.recipe_id, answer: meal.sIntentAnswer });

            obj_savePromptActions.hidden = true;
            obj_savePromptText.textContent = "Thanks! It's in your Liked recipes.";
            nThanksTimer = setTimeout(function() { obj_savePrompt.hidden = true; }, 1600);
        });

        // The start of the OKR 1 clock: the first time a new user sees this feed.
        // Not while the first-visit welcome popup or tour (js/onboarding.js) is
        // on screen, so the tour doesn't eat into the 3 minutes. If the tour
        // takes them to another page, the clock starts on their next visit here.
        function IsTourShowing() {
            return Boolean(document.querySelector("#onboarding-welcome[open], .tour"));
        }

        function LogDiscoverViewed(bWaited) {
            window.logEvent("discover_viewed", { meals: meals.length, waited_for_tour: bWaited });
        }

        // Called once the picks have loaded, so the logged meal count is right
        function StartDiscoverClock() {
            if (!IsTourShowing()) {
                LogDiscoverViewed(false);
                return;
            }
            // the popup closing and the tour being removed both change the DOM
            const objTourWatcher = new MutationObserver(function() {
                if (IsTourShowing()) return;
                objTourWatcher.disconnect();
                LogDiscoverViewed(true);
            });
            objTourWatcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
        }

        // Replaces the card with a message, using the "all caught up" screen
        function ShowMessage(sTitle, sText) {
            obj_slide.style.display = "none";
            document.getElementById("restart-btn").hidden = true;
            obj_done.querySelector("h2").textContent = sTitle;
            obj_done.querySelector("p").textContent = sText;
            document.getElementById("picks-count").textContent = "";
            obj_done.hidden = false;
            obj_prevArrow.disabled = true;
            obj_nextArrow.disabled = true;
        }

        // Gets today's picks from GET /api/me/daily-picks, then shows the first one.
        // Each pick already has its id, whether this user liked it, its rating
        // and the pantry numbers.
        async function LoadDailyPicks() {
            try {
                const response = await fetch("/api/me/daily-picks");
                if (!response.ok) throw new Error(`Request failed (${response.status})`);
                meals = await response.json();
            } catch (error) {
                console.error("Could not load today's picks:", error);
                ShowMessage("Couldn't load today's picks", "Refresh the page to try again.");
                return;
            }

            bRecipesLoaded = true;
            if (meals.length === 0) {
                ShowMessage("No picks today", "You've already saved every recipe we have. Check back when new ones are added.");
                return;
            }

            SetUpMeals();
            RenderMeal();
            obj_slide.style.visibility = "";
            StartDiscoverClock();
        }

        // ---------- Add to meal plan popup ----------
        // The popup itself is shared with the recipe page: js/plan-dialog.js
        const obj_plan = document.getElementById("plan-dialog");

        document.getElementById("calendar-btn").addEventListener("click", function() {
            if (!HasRealRecipe(meals[nCurrent])) return;
            PlanDialog.open(meals[nCurrent], { entryPoint: "home_card" });
        });

        // ---------- "Did you find meals you'd actually make?" (OKR 2) ----------
        // After the user swipes past the 5th meal, ask them to rate today's picks
        // 1-5 stars. The server decides if it's due (at most once every 7 days per
        // user, whatever they answer) and logs the answer: back/src/routes/mealFit.js.
        const obj_mealFit = document.getElementById("meal-fit");
        const obj_mealFitForm = document.getElementById("meal-fit-form");
        const obj_mealFitStars = document.getElementById("meal-fit-stars");
        const obj_mealFitSubmit = document.getElementById("meal-fit-submit");
        const obj_mealFitError = document.getElementById("meal-fit-error");
        const aMealFitStarLabels = [...obj_mealFitStars.querySelectorAll(".meal-fit-star")];
        // only ask the server once per page load ("See them again" doesn't re-ask)
        let bMealFitChecked = false;
        // true once the rating is saved, so closing the popup isn't logged as "not now"
        let bMealFitAnswered = false;
        let nMealFitPicked = 0;

        // waits a moment so "You're all caught up" shows first
        function MaybeAskMealFit() {
            if (bMealFitChecked) return;
            setTimeout(async function() {
                // swiped back to a meal, or the tour is on screen: try again next time
                if (bMealFitChecked || obj_done.hidden || IsTourShowing() || obj_plan.open) return;
                bMealFitChecked = true;
                try {
                    const response = await fetch("/api/me/meal-fit/prompt", { method: "POST" });
                    if (!response.ok) throw new Error(`Request failed (${response.status})`);
                    if ((await response.json()).show) obj_mealFit.showModal();
                } catch (error) {
                    console.error("Could not check the rating prompt:", error);
                }
            }, 700);
        }

        // fills the stars up to nStars (the one hovered, or the one picked)
        function LightStars(nStars) {
            aMealFitStarLabels.forEach(function(obj_label) {
                obj_label.classList.toggle("lit", Number(obj_label.dataset.stars) <= nStars);
            });
        }

        obj_mealFitStars.addEventListener("change", function(event) {
            nMealFitPicked = Number(event.target.value);
            obj_mealFitSubmit.disabled = false;
            obj_mealFitError.hidden = true;
            LightStars(nMealFitPicked);
        });
        obj_mealFitStars.addEventListener("mouseover", function(event) {
            const obj_label = event.target.closest(".meal-fit-star");
            if (obj_label) LightStars(Number(obj_label.dataset.stars));
        });
        obj_mealFitStars.addEventListener("mouseleave", function() { LightStars(nMealFitPicked); });

        obj_mealFitForm.addEventListener("submit", async function(event) {
            event.preventDefault();
            if (!nMealFitPicked) return;
            obj_mealFitSubmit.disabled = true;
            obj_mealFitError.hidden = true;
            try {
                const response = await fetch("/api/me/meal-fit/answer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rating: nMealFitPicked }),
                });
                // 409: already answered (e.g. in another tab), so nothing left to do
                if (!response.ok && response.status !== 409) throw new Error(`Request failed (${response.status})`);
                bMealFitAnswered = true;
                document.getElementById("meal-fit-body").hidden = true;
                document.getElementById("meal-fit-thanks").hidden = false;
                setTimeout(function() { obj_mealFit.close(); }, 1600);
            } catch (error) {
                console.error("Could not save the rating:", error);
                obj_mealFitError.textContent = "Couldn't save your rating. Please try again.";
                obj_mealFitError.hidden = false;
                obj_mealFitSubmit.disabled = false;
            }
        });

        // X, Not now and Escape all close it; without a rating that's logged as dismissed
        function CloseMealFit() { obj_mealFit.close(); }
        document.getElementById("meal-fit-close").addEventListener("click", CloseMealFit);
        document.getElementById("meal-fit-later").addEventListener("click", CloseMealFit);
        obj_mealFit.addEventListener("close", function() {
            if (bMealFitAnswered) return;
            bMealFitAnswered = true;
            fetch("/api/me/meal-fit/answer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dismissed: true }),
                keepalive: true,
            }).catch(function(error) { console.error("Could not save the dismissal:", error); });
        });

        document.getElementById("restart-btn").addEventListener("click", function() {
            nCurrent = 0;
            obj_done.hidden = true;
            RenderMeal();
            SlideIn(1);
        });


        // ---------- Recipe page ----------
        // Clicking the recipe's name opens its own page (/recipes/:id,
        // views/recipe.ejs) with the ingredients and directions.

        // The title and the "In pantry" line both open it.
        function OpenRecipe() {
            // a swipe that started on the card shouldn't also open the page
            if (bSuppressClick) return;
            // wait for the picks to load, so this never opens the wrong recipe
            if (!HasRealRecipe(meals[nCurrent])) return;
            location.href = "/recipes/" + encodeURIComponent(meals[nCurrent].recipe_id);
        }

        document.getElementById("open-details").addEventListener("click", OpenRecipe);
        document.getElementById("meal-pantry-pill").addEventListener("click", OpenRecipe);


        LoadDailyPicks();