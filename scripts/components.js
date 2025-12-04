/**
 * Alusani Academy - Shared Components
 * Handles consistent rendering of Navbar and Footer across all pages.
 */

class UIComponents {
    constructor() {
        // Determine if we are in the root folder or a subfolder to fix image/link paths
        this.isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
        this.pathPrefix = this.isRoot ? './' : '../';
    }

    init() {
        this.renderNavbar();
        this.renderFooter();
        this.initializeHamburger();
        this.highlightActiveLink();
    }

    renderNavbar() {
        const navContainer = document.querySelector('nav.navbar');
        if (!navContainer) return;

        // Note: Using the structure from programs.html and styling from index.css
        navContainer.innerHTML = `
            <div class="nav-container">
                <div class="nav-logo">
                    <a href="${this.pathPrefix}index.html">
                        <img src="${this.pathPrefix}images/amsaLogo.png" alt="Alusani Academy Logo">
                    </a>
                </div>
                <div class="nav-menu" id="nav-menu">
                    <a href="${this.pathPrefix}index.html" class="nav-link" data-page="home">Home</a>
                    <a href="${this.pathPrefix}pages/programs.html" class="nav-link" data-page="programs">Programs</a>
                    <a href="${this.pathPrefix}pages/about.html" class="nav-link" data-page="about">About</a>
                    <a href="${this.pathPrefix}pages/gallery.html" class="nav-link" data-page="gallery">Gallery</a>
                    <a href="${this.pathPrefix}pages/contact.html" class="nav-link" data-page="contact">Contact</a>
                    <a href="${this.pathPrefix}pages/portal.html" class="nav-link" data-page="portal">Portal</a>
                    <a href="${this.pathPrefix}pages/applications.html" class="nav-link btn-enroll">Enroll Now</a>
                </div>
                <div class="hamburger" id="hamburger">
                    <span class="bar"></span>
                    <span class="bar"></span>
                    <span class="bar"></span>
                </div>
            </div>
        `;
    }

    renderFooter() {
        const footerContainer = document.querySelector('footer');
        if (!footerContainer) return;

        const year = new Date().getFullYear();

        // Note: Using structure from application.html and index.css
        footerContainer.innerHTML = `
            <div class="container">
                <div class="footer-content">
                    <div class="footer-main">
                        <div class="footer-brand">
                            <div class="footer-logo">
                                <img src="${this.pathPrefix}images/amsaLogo.png" alt="Alusani Academy Logo" loading="lazy">
                            </div>
                            <p class="footer-description">
                                Empowering future leaders through excellence in mathematics and science education.
                            </p>
                            <div class="footer-contact">
                                <div class="contact-item">
                                    <i class="fas fa-map-marker-alt"></i>
                                    <span>346 Mahosi Street, Tshianangani, Ha-Mashamba, 0942</span>
                                </div>
                                <div class="contact-item">
                                    <i class="fas fa-envelope"></i>
                                    <span>info.alusaniacademy.co.za</span>
                                </div>
                                <div class="contact-item">
                                    <i class="fas fa-phone"></i>
                                    <span>+27 76 106 3120</span>
                                </div>
                            </div>
                        </div>

                        <div class="footer-links-grid">
                            <div class="footer-links">
                                <h4>Programs</h4>
                                <a href="${this.pathPrefix}pages/programs.html?grade=8-9">Grade 8-9 Programs</a>
                                <a href="${this.pathPrefix}pages/programs.html?grade=10-12">Grade 10-12 Programs</a>
                                <a href="#">Mathematics</a>
                                <a href="#">Science Programs</a>
                                <a href="#">Exam Preparation</a>
                            </div>
                            
                            <div class="footer-links">
                                <h4>Academy</h4>
                                <a href="${this.pathPrefix}pages/about.html">About Us</a>
                                <a href="#">Our Mission</a>
                                <a href="#">Success Stories</a>
                                <a href="#">Our Team</a>
                                <a href="#">Careers</a>
                            </div>
                            
                            <div class="footer-links">
                                <h4>Support</h4>
                                <a href="#">Contact Us</a>
                                <a href="#">FAQs</a>
                                <a href="#">Resources</a>
                                <a href="#">Privacy Policy</a>
                                <a href="#">Terms of Service</a>
                            </div>
                        </div>

                        <div class="footer-newsletter">
                            <h4>Stay Updated</h4>
                            <p>Subscribe to our newsletter for updates and educational resources</p>
                            <form class="newsletter-form">
                                <input type="email" placeholder="info.alusaniacademy.co.za" required>
                                <button type="submit">Subscribe</button>
                            </form>
                        </div>
                    </div>

                    <div class="footer-social">
                        <h4>Connect With Us</h4>
                        <div class="social-icons">
                            <a href="#" class="social-link"><i class="fab fa-facebook-f"></i></a>
                            <a href="#" class="social-link"><i class="fab fa-twitter"></i></a>
                            <a href="#" class="social-link"><i class="fab fa-instagram"></i></a>
                            <a href="#" class="social-link"><i class="fab fa-linkedin-in"></i></a>
                            <a href="#" class="social-link"><i class="fab fa-youtube"></i></a>
                        </div>
                    </div>
                </div>

                <div class="footer-bottom">
                    <div class="footer-bottom-content">
                        <p>&copy; ${year} Alusani Maths and Science Academy. All rights reserved.</p>
                        <div class="footer-credits">
                            <p>Developed and maintained by <strong>Nalokie Holdings</strong></p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    initializeHamburger() {
        const hamburger = document.getElementById('hamburger');
        const navMenu = document.getElementById('nav-menu');

        if (hamburger && navMenu) {
            hamburger.addEventListener('click', () => {
                hamburger.classList.toggle('active');
                navMenu.classList.toggle('active');
            });

            // Close menu when a link is clicked
            document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            }));
        }
    }

    highlightActiveLink() {
        const currentPage = window.location.pathname.split("/").pop().replace('.html', '') || 'home';
        const navLinks = document.querySelectorAll('.nav-link');

        navLinks.forEach(link => {
            // Remove hardcoded active classes
            link.classList.remove('active');
            
            // Check data-page attribute or href match
            const pageData = link.getAttribute('data-page');
            if (pageData === currentPage || (currentPage === 'index' && pageData === 'home')) {
                link.classList.add('active');
            }
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const ui = new UIComponents();
    ui.init();
});