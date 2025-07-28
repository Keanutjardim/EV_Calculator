document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const vehiclePriceInput = document.getElementById('vehicle-price');
    const distanceSlider = document.getElementById('distance');
    const distanceValue = document.getElementById('distance-value');
    const fuelTypeSelect = document.getElementById('fuel-type');
    const ebucksLevelSlider = document.getElementById('ebucks-level');
    const ebucksLevelValue = document.getElementById('ebucks-level-value');
    const paymentTermSlider = document.getElementById('payment-term');
    const paymentTermValue = document.getElementById('payment-term-value');
    const hasInsuranceCheckbox = document.getElementById('has-insurance');
    const hasFinancingCheckbox = document.getElementById('has-financing');
    const hasSolarCheckbox = document.getElementById('has-solar');
    const calculateBtn = document.getElementById('calculate-btn');
    
    // Results Elements
    const totalSavingsElement = document.getElementById('total-savings').querySelector('span');
    const upfrontSavingsElement = document.getElementById('upfront-savings').querySelector('span');
    const termSavingsElement = document.getElementById('term-savings').querySelector('span');
    const ebucksSavingsElement = document.getElementById('ebucks-savings');
    const carbonSavingsElement = document.getElementById('carbon-savings');
    const fuelSavingsElement = document.getElementById('fuel-savings');
    
    // Chart
    let savingsChart = null;
    
    // Initialize sliders
    updateSliderValue(distanceSlider, distanceValue, formatNumber);
    updateSliderValue(ebucksLevelSlider, ebucksLevelValue);
    updateSliderValue(paymentTermSlider, paymentTermValue, formatNumber);
    
    // Format price input
    vehiclePriceInput.addEventListener('blur', function() {
        const value = parseFloat(this.value.replace(/[^\d.-]/g, ''));
        if (!isNaN(value)) {
            this.value = value.toFixed(2);
        }
    });
    
    // Event listeners for sliders
    distanceSlider.addEventListener('input', function() {
        updateSliderValue(this, distanceValue, formatNumber);
    });
    
    ebucksLevelSlider.addEventListener('input', function() {
        updateSliderValue(this, ebucksLevelValue);
    });
    
    paymentTermSlider.addEventListener('input', function() {
        updateSliderValue(this, paymentTermValue, formatNumber);
    });
    
    // Calculate button
    calculateBtn.addEventListener('click', calculateSavings);
    
    // Initial calculation
    calculateSavings();
    
    // Functions
    function updateSliderValue(slider, valueElement, formatFn = value => value) {
        valueElement.textContent = formatFn(slider.value);
    }
    
    function formatNumber(number) {
        return new Intl.NumberFormat('en-ZA').format(number);
    }
    
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: 'ZAR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount).replace('ZAR', 'R');
    }
    
    function calculateSavings() {
        // Get input values
        const data = {
            ebucksLevel: parseInt(ebucksLevelSlider.value),
            fuelType: fuelTypeSelect.value,
            distance: parseFloat(distanceSlider.value),
            hasInsurance: hasInsuranceCheckbox.checked,
            hasFinancing: hasFinancingCheckbox.checked,
            hasSolar: hasSolarCheckbox.checked
        };
        
        // Show loading state
        setCalculatingState(true);
        
        // Send data to server
        fetch('/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            // Update results
            totalSavingsElement.textContent = formatNumber(result.totalSavings);
            upfrontSavingsElement.textContent = formatNumber(result.upfrontSavings);
            termSavingsElement.textContent = formatNumber(result.fuelSpendSavings);
            ebucksSavingsElement.textContent = formatCurrency(result.presentValueEbucks);
            carbonSavingsElement.textContent = formatCurrency(result.carbonTaxSavings);
            fuelSavingsElement.textContent = formatCurrency(result.fuelSpendSavings);
            
            // Update chart
            updateSavingsChart(result);
            
            // Animate results
            animateResults();
        })
        .catch(error => {
            console.error('Error calculating savings:', error);
            alert('There was an error calculating your savings. Please try again.');
        })
        .finally(() => {
            setCalculatingState(false);
        });
    }
    
    function setCalculatingState(isCalculating) {
        if (isCalculating) {
            calculateBtn.textContent = 'CALCULATING...';
            calculateBtn.disabled = true;
        } else {
            calculateBtn.textContent = 'CALCULATE SAVINGS';
            calculateBtn.disabled = false;
        }
    }
    
    function animateResults() {
        document.querySelectorAll('.result-card').forEach(card => {
            card.style.animation = 'none';
            setTimeout(() => {
                card.style.animation = 'fadeIn 0.5s ease-out';
            }, 10);
        });
    }
    
    function updateSavingsChart(data) {
        const ctx = document.getElementById('savings-chart');
        
        if (savingsChart) {
            savingsChart.destroy();
        }
        
        savingsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Upfront Savings', 'Loan Term Savings'],
                datasets: [{
                    label: 'Savings (ZAR)',
                    data: [data.upfrontSavings, data.fuelSpendSavings],
                    backgroundColor: [
                        'rgba(0, 166, 182, 0.8)',
                        'rgba(248, 156, 51, 0.8)'
                    ],
                    borderColor: [
                        'rgba(0, 166, 182, 1)',
                        'rgba(248, 156, 51, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'R' + context.raw.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }
});