document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const mainNav = document.querySelector('.main-nav');

    if (mobileBtn && mainNav) {
        mobileBtn.addEventListener('click', () => {
            mainNav.classList.toggle('active');
            mobileBtn.classList.toggle('open');
        });

        // Close menu on link click
        mainNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mainNav.classList.remove('active');
                mobileBtn.classList.remove('open');
            });
        });
    }

    // Inquiry Form Submission Simulation
    const inquiryForm = document.getElementById('inquiryForm');
    const successMsg = document.getElementById('formSuccessMsg');

    if (inquiryForm) {
        inquiryForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const fullName = document.getElementById('fullName').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const message = document.getElementById('message').value.trim();

            if (fullName && phone && message) {
                inquiryForm.reset();
                successMsg.classList.add('form-success-visible');
                
                setTimeout(() => {
                    successMsg.classList.remove('form-success-visible');
                }, 6000);
            }
        });
    }
});