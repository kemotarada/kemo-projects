document.addEventListener('DOMContentLoaded', () => {
    // Mobile Navigation Toggle
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const mainNav = document.querySelector('.main-nav');

    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', () => {
            const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
            menuToggle.setAttribute('aria-expanded', !isExpanded);
            mainNav.classList.toggle('active');
        });
    }

    // Header scroll background effect
    const header = document.getElementById('masthead');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.background = 'rgba(13, 13, 13, 0.95)';
            header.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        } else {
            header.style.background = 'rgba(13, 13, 13, 0.85)';
            header.style.boxShadow = 'none';
        }
    });

    // Form submission handling
    const form = document.getElementById('sampleRequestForm');
    const successMessage = document.getElementById('formSuccessMessage');

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const clientName = document.getElementById('clientName').value.trim();
            const clientEmail = document.getElementById('clientEmail').value.trim();
            const projectType = document.getElementById('projectType').value;

            if (!clientName || !clientEmail || !projectType) {
                alert('يرجى ملء جميع الحقول المطلوبة لضمان سرعة معالجة طلبك.');
                return;
            }

            // Simulate successful submission
            form.reset();
            successMessage.style.display = 'block';
            
            setTimeout(() => {
                successMessage.style.display = 'none';
            }, 6000);
        });
    }
});