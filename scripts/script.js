// Navbar functionality
const navbar = document.querySelector(".navbar");
const hamburger = document.getElementById("hamburger");
const navMenu = document.getElementById("nav-menu");

// Change navbar style on scroll
window.addEventListener("scroll", () => {
  if (window.scrollY > 100) {
    navbar.classList.add("scrolled");
  } else {
    navbar.classList.remove("scrolled");
  }
});

// Mobile menu toggle
hamburger.addEventListener("click", () => {
  hamburger.classList.toggle("active");
  navMenu.classList.toggle("active");
});

// Close mobile menu when clicking on a link
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    hamburger.classList.remove("active");
    navMenu.classList.remove("active");
  });
});

// Home Hero Carousel functionality
const homeHeroSlides = document.querySelectorAll(".home-hero-slide");
const homeHeroIndicators = document.querySelectorAll(".home-hero-indicator");
const homeHeroPrevBtn = document.querySelector(".home-hero-prev-btn");
const homeHeroNextBtn = document.querySelector(".home-hero-next-btn");
let currentHomeHeroSlide = 0;
let homeHeroSlideInterval;

// Function to show a specific slide
function showHomeHeroSlide(n) {
  // Remove active class from all slides and indicators
  homeHeroSlides.forEach((slide) => slide.classList.remove("active"));
  homeHeroIndicators.forEach((indicator) =>
    indicator.classList.remove("active")
  );

  // Adjust currentHomeHeroSlide index if out of bounds
  if (n >= homeHeroSlides.length) currentHomeHeroSlide = 0;
  if (n < 0) currentHomeHeroSlide = homeHeroSlides.length - 1;

  // Add active class to current slide and indicator
  homeHeroSlides[currentHomeHeroSlide].classList.add("active");
  homeHeroIndicators[currentHomeHeroSlide].classList.add("active");
}

// Function to move to next slide
function nextHomeHeroSlide() {
  currentHomeHeroSlide++;
  showHomeHeroSlide(currentHomeHeroSlide);
}

// Function to move to previous slide
function prevHomeHeroSlide() {
  currentHomeHeroSlide--;
  showHomeHeroSlide(currentHomeHeroSlide);
}

// Add event listeners to carousel controls
if (homeHeroPrevBtn && homeHeroNextBtn) {
  homeHeroPrevBtn.addEventListener("click", () => {
    clearInterval(homeHeroSlideInterval);
    prevHomeHeroSlide();
    startHomeHeroSlideShow();
  });

  homeHeroNextBtn.addEventListener("click", () => {
    clearInterval(homeHeroSlideInterval);
    nextHomeHeroSlide();
    startHomeHeroSlideShow();
  });
}

// Add event listeners to indicators
if (homeHeroIndicators.length > 0) {
  homeHeroIndicators.forEach((indicator) => {
    indicator.addEventListener("click", () => {
      clearInterval(homeHeroSlideInterval);
      currentHomeHeroSlide = parseInt(indicator.getAttribute("data-slide"));
      showHomeHeroSlide(currentHomeHeroSlide);
      startHomeHeroSlideShow();
    });
  });
}

// Start automatic slideshow
function startHomeHeroSlideShow() {
  homeHeroSlideInterval = setInterval(nextHomeHeroSlide, 5000);
}

// Initialize home hero carousel if elements exist
if (homeHeroSlides.length > 0) {
  showHomeHeroSlide(currentHomeHeroSlide);
  startHomeHeroSlideShow();
}

// Programs Carousel functionality (if you have another carousel on programs page)
const programSlides = document.querySelectorAll(".carousel-slide");
const programIndicators = document.querySelectorAll(".indicator");
const programPrevBtn = document.querySelector(".prev-btn");
const programNextBtn = document.querySelector(".next-btn");
let currentProgramSlide = 0;
let programSlideInterval;

// Function to show a specific program slide
function showProgramSlide(n) {
  // Remove active class from all slides and indicators
  programSlides.forEach((slide) => slide.classList.remove("active"));
  programIndicators.forEach((indicator) =>
    indicator.classList.remove("active")
  );

  // Adjust currentProgramSlide index if out of bounds
  if (n >= programSlides.length) currentProgramSlide = 0;
  if (n < 0) currentProgramSlide = programSlides.length - 1;

  // Add active class to current slide and indicator
  programSlides[currentProgramSlide].classList.add("active");
  programIndicators[currentProgramSlide].classList.add("active");
}

// Function to move to next program slide
function nextProgramSlide() {
  currentProgramSlide++;
  showProgramSlide(currentProgramSlide);
}

// Function to move to previous program slide
function prevProgramSlide() {
  currentProgramSlide--;
  showProgramSlide(currentProgramSlide);
}

// Add event listeners to program carousel controls if they exist
if (programPrevBtn && programNextBtn) {
  programPrevBtn.addEventListener("click", () => {
    clearInterval(programSlideInterval);
    prevProgramSlide();
    startProgramSlideShow();
  });

  programNextBtn.addEventListener("click", () => {
    clearInterval(programSlideInterval);
    nextProgramSlide();
    startProgramSlideShow();
  });
}

// Add event listeners to program indicators if they exist
if (programIndicators.length > 0) {
  programIndicators.forEach((indicator) => {
    indicator.addEventListener("click", () => {
      clearInterval(programSlideInterval);
      currentProgramSlide = parseInt(indicator.getAttribute("data-slide"));
      showProgramSlide(currentProgramSlide);
      startProgramSlideShow();
    });
  });
}

// Start automatic program slideshow
function startProgramSlideShow() {
  programSlideInterval = setInterval(nextProgramSlide, 5000);
}

// Initialize program carousel if elements exist
if (programSlides.length > 0) {
  showProgramSlide(currentProgramSlide);
  startProgramSlideShow();
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const targetId = this.getAttribute("href");
    if (targetId === "#") return;

    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      window.scrollTo({
        top: targetElement.offsetTop - 80,
        behavior: "smooth",
      });
    }
  });
});

// Animation on scroll
const animateOnScroll = () => {
  const elements = document.querySelectorAll(
    ".program-card, .testimonial-card"
  );

  elements.forEach((element) => {
    const elementPosition = element.getBoundingClientRect().top;
    const screenPosition = window.innerHeight / 1.3;

    if (elementPosition < screenPosition) {
      element.style.opacity = 1;
      element.style.transform = "translateY(0)";
    }
  });
};

// Initialize elements for animation
document
  .querySelectorAll(".program-card, .testimonial-card")
  .forEach((element) => {
    element.style.opacity = 0;
    element.style.transform = "translateY(50px)";
    element.style.transition = "all 0.8s ease";
  });

window.addEventListener("scroll", animateOnScroll);
// Trigger once on load in case elements are already in view
window.addEventListener("load", animateOnScroll);
