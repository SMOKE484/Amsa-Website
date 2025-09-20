// Animate stats counting
document.addEventListener("DOMContentLoaded", function () {
  // Animate journey stats
  const statNumbers = document.querySelectorAll(".stat-number");

  function animateStats() {
    statNumbers.forEach((stat) => {
      const target = parseInt(stat.getAttribute("data-target"));
      const duration = 2000;
      const increment = target / (duration / 16);

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

  // Intersection Observer for stats
  const statsObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateStats();
          statsObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  const journeyStats = document.querySelector(".journey-stats");
  if (journeyStats) {
    statsObserver.observe(journeyStats);
  }

  // Animation for philosophy cards
  const philosophyCards = document.querySelectorAll(".philosophy-card");

  const philosophyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = 1;
            entry.target.style.transform = "translateY(0)";
          }, index * 200);
          philosophyObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  philosophyCards.forEach((card) => {
    card.style.opacity = 0;
    card.style.transform = "translateY(50px)";
    card.style.transition = "all 0.8s ease";
    philosophyObserver.observe(card);
  });

  // Animation for team members
  const teamMembers = document.querySelectorAll(".team-member");

  const teamObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = 1;
            entry.target.style.transform = "translateY(0)";
          }, index * 200);
          teamObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  teamMembers.forEach((member) => {
    member.style.opacity = 0;
    member.style.transform = "translateY(50px)";
    member.style.transition = "all 0.8s ease";
    teamObserver.observe(member);
  });

  // Gallery hover effect enhancement
  const galleryItems = document.querySelectorAll(".gallery-item");

  galleryItems.forEach((item) => {
    item.addEventListener("mouseenter", function () {
      this.querySelector(".gallery-overlay").style.opacity = "1";
    });

    item.addEventListener("mouseleave", function () {
      this.querySelector(".gallery-overlay").style.opacity = "0";
    });
  });
});
