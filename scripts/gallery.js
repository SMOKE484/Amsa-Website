// Gallery functionality
document.addEventListener('DOMContentLoaded', function() {
    // Filter functionality
    const filterButtons = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery-item');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Get filter value
            const filterValue = button.getAttribute('data-filter');
            
            // Filter gallery items
            galleryItems.forEach(item => {
                if (filterValue === 'all' || item.getAttribute('data-category') === filterValue) {
                    item.style.display = 'block';
                    setTimeout(() => {
                        item.style.opacity = '1';
                        item.style.transform = 'translateY(0)';
                    }, 50);
                } else {
                    item.style.opacity = '0';
                    item.style.transform = 'translateY(20px)';
                    setTimeout(() => {
                        item.style.display = 'none';
                    }, 300);
                }
            });
        });
    });
    
    // Lightbox functionality
    const lightboxModal = document.getElementById('lightbox-modal');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxTitle = document.getElementById('lightbox-title');
    const lightboxDescription = document.getElementById('lightbox-description');
    const lightboxClose = document.getElementById('lightbox-close');
    const lightboxPrev = document.getElementById('lightbox-prev');
    const lightboxNext = document.getElementById('lightbox-next');
    
    const viewButtons = document.querySelectorAll('.view-btn');
    let currentImageIndex = 0;
    let images = [];
    
    // Prepare images array and add click events
    viewButtons.forEach((button, index) => {
        const galleryItem = button.closest('.gallery-item');
        const imageSrc = galleryItem.querySelector('img').src;
        const title = galleryItem.querySelector('h3').textContent;
        const description = galleryItem.querySelector('p').textContent;
        
        images.push({
            src: imageSrc,
            title: title,
            description: description
        });
        
        button.addEventListener('click', () => {
            currentImageIndex = index;
            openLightbox();
        });
    });
    
    // Open lightbox
    function openLightbox() {
        lightboxImage.src = images[currentImageIndex].src;
        lightboxTitle.textContent = images[currentImageIndex].title;
        lightboxDescription.textContent = images[currentImageIndex].description;
        lightboxModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    // Close lightbox
    lightboxClose.addEventListener('click', closeLightbox);
    
    function closeLightbox() {
        lightboxModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
    
    // Navigate lightbox
    lightboxPrev.addEventListener('click', () => {
        currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
        openLightbox();
    });
    
    lightboxNext.addEventListener('click', () => {
        currentImageIndex = (currentImageIndex + 1) % images.length;
        openLightbox();
    });
    
    // Close lightbox on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightboxModal.classList.contains('active')) {
            closeLightbox();
        }
    });
    
    // Close lightbox when clicking outside content
    lightboxModal.addEventListener('click', (e) => {
        if (e.target === lightboxModal) {
            closeLightbox();
        }
    });
    
    // Load more functionality (placeholder)
    const loadMoreBtn = document.querySelector('.load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            loadMoreBtn.textContent = 'More Photos Coming Soon';
            loadMoreBtn.disabled = true;
            setTimeout(() => {
                loadMoreBtn.textContent = 'Load More';
                loadMoreBtn.disabled = false;
            }, 2000);
        });
    }
});