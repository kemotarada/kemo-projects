document.addEventListener('DOMContentLoaded', () => {
    const leadForm = document.getElementById('leadForm');
    if (leadForm) {
        leadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            alert(`شكراً لك ${name}، تم إرسال طلبك بنجاح إلى شركة TARADA TRADE وسيتم التواصل معك قريباً.`);
            leadForm.reset();
        });
    }
});