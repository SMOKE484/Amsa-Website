// Programs Page Functionality
document.addEventListener("DOMContentLoaded", function () {
  // Filter programs by grade
  const filterBtns = document.querySelectorAll(".filter-btn");
  const gradeSections = document.querySelectorAll(".grade-programs");

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      // Remove active class from all buttons
      filterBtns.forEach((b) => b.classList.remove("active"));

      // Add active class to clicked button
      this.classList.add("active");

      const grade = this.getAttribute("data-grade");

      // Show/hide grade sections
      gradeSections.forEach((section) => {
        if (grade === "all" || section.getAttribute("data-grade") === grade) {
          section.style.display = "block";
        } else {
          section.style.display = "none";
        }
      });
    });
  });

  // Animate stats counting
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

  const heroStats = document.querySelector(".hero-stats");
  if (heroStats) {
    statsObserver.observe(heroStats);
  }

  // Animation for program cards
  const programCards = document.querySelectorAll(".program-card");

  const programObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = 1;
            entry.target.style.transform = "translateY(0)";
          }, index * 100);
          programObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  programCards.forEach((card) => {
    card.style.opacity = 0;
    card.style.transform = "translateY(50px)";
    card.style.transition = "all 0.8s ease";
    programObserver.observe(card);
  });

  // Animation for benefit cards
  const benefitCards = document.querySelectorAll(".benefit-card");

  const benefitObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = 1;
            entry.target.style.transform = "translateY(0)";
          }, index * 150);
          benefitObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  benefitCards.forEach((card) => {
    card.style.opacity = 0;
    card.style.transform = "translateY(30px)";
    card.style.transition = "all 0.8s ease";
    benefitObserver.observe(card);
  });
});
