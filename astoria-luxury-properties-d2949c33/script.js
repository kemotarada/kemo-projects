document.addEventListener('DOMContentLoaded', () => {
    // Sticky Header Effect
    const header = document.querySelector('.site-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Mobile Menu Toggle with Proper ARIA & Overflow Lock
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    
    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => {
            const isOpen = mobileMenu.classList.toggle('open');
            menuToggle.classList.toggle('active', isOpen);
            menuToggle.setAttribute('aria-expanded', isOpen);
            
            if (isOpen) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });

        // Close menu when clicking links
        const mobileLinks = mobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('open');
                menuToggle.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            });
        });
    }

    // Property Card Day/Night Toggle
    const propertyCards = document.querySelectorAll('.property-card');
    propertyCards.forEach(card => {
        const toggleButtons = card.querySelectorAll('.toggle-btn');
        const imgElement = card.querySelector('.property-img');
        const dayImg = card.getAttribute('data-day-img');
        const nightImg = card.getAttribute('data-night-img');

        toggleButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const mode = btn.getAttribute('data-mode');
                if (mode === 'night' && nightImg) {
                    imgElement.src = nightImg;
                } else if (mode === 'day' && dayImg) {
                    imgElement.src = dayImg;
                }
            });
        });
    });

    // Animate Market Insights Chart on Scroll
    const chartSection = document.querySelector('#market-insights');
    const bars = document.querySelectorAll('.bar');

    if (chartSection && bars.length > 0) {
        const observerOptions = {
            root: null,
            threshold: 0.2
        };

        const observer = new IntersectionObserver((entries, observer) => {
            entries.entries.forEach(entry => {
                if (entry.isIntersecting) {
                    bars.forEach(bar => {
                        const targetWidth = bar.style.getPropertyValue('--target-width');
                        bar.style.width = targetWidth;
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        observer.observe(chartSection);
    }

    // Premium Form Submission Handling
    const vipForm = document.getElementById('vipForm');
    const successMessage = document.getElementById('successMessage');

    if (vipForm && successMessage) {
        vipForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            vipForm.classList.add('hidden');
            successMessage.classList.remove('hidden');
            
            const formSection = document.getElementById('vip-inquiry');
            if (formSection) {
                formSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
});