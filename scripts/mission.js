// Tab functionality
document.addEventListener("DOMContentLoaded", function () {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      // Remove active class from all buttons and panes
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      // Add active class to clicked button
      this.classList.add("active");

      // Show corresponding tab pane
      const tabId = this.getAttribute("data-tab");
      document.getElementById(tabId).classList.add("active");
    });
  });

  // Animate stats counting
  const statNumbers = document.querySelectorAll(".stat-number");

  function animateStats() {
    statNumbers.forEach((stat) => {
      const target = parseInt(stat.getAttribute("data-target"));
      const duration = 2000; // 2 seconds
      const increment = target / (duration / 16); // 60fps

      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          clearInterval(timer);
          current = target;
        }
        stat.textContent = Math.round(current);
      }, 16);
    });
  }

  // Intersection Observer to trigger animation when stats are in view
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateStats();
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  // Observe the mission stats section
  const missionStats = document.querySelector(".mission-stats");
  if (missionStats) {
    observer.observe(missionStats);
  }

  // Add animation to value cards on scroll
  const valueCards = document.querySelectorAll(".value-card");

  const valueObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = 1;
          entry.target.style.transform = "translateY(0)";
          valueObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  // Initialize value cards for animation
  valueCards.forEach((card) => {
    card.style.opacity = 0;
    card.style.transform = "translateY(50px)";
    card.style.transition = "all 0.8s ease";
    valueObserver.observe(card);
  });
});
