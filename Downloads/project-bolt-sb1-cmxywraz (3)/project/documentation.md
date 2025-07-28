# EV Calculator Documentation

This document explains the calculations and logic used in the EV Calculator application.

## Table of Contents

1. [Main Calculation Module](#main-calculation-module)
2. [eBucks Benefits Calculation](#ebucks-benefits-calculation)
3. [Carbon Tax Savings Calculation](#carbon-tax-savings-calculation)
4. [Fuel Spend Savings Calculation](#fuel-spend-savings-calculation)
5. [Present Value Calculations](#present-value-calculations)
6. [Vehicle Comparison Calculations](#vehicle-comparison-calculations)
7. [Web Scraping Implementation](#web-scraping-implementation)
8. [Calculation Assumptions](#calculation-assumptions)

## Main Calculation Module

The primary calculations are implemented in both `server.js` and `app.py`. They handle the same logic but in different languages (JavaScript and Python respectively).

### Key Constants (Lines 14-44 in app.py, Lines 14-45 in server.js)

```javascript
// Fuel prices (ZAR per litre) for South African fuel types
const FUEL_PRICES = {
  'diesel': 22.00,
  'petrol95': 23.00,
  'petrol93': 22.70
};

// Fuel consumption in litres per 100 km for each fuel type
const FUEL_CONSUMPTION = {
  'diesel': 6.5,
  'petrol95': 7.5,
  'petrol93': 7.3
};

// eBucks rates (R per litre) – base rates depend on level
const BASE_EBUCKS = {
  1: 0.40,
  2: 0.80,
  3: 1.60,
  4: 3.20,
  5: 4.00
};

// Insurance & Financing rates (R per litre) by level
const INSURANCE_RATES = {
  1: 0.10,
  2: 0.20,
  3: 0.40,
  4: 0.80,
  5: 2.00
};
const FINANCING_RATES = {
  1: 0.10,
  2: 0.20,
  3: 0.40,
  4: 0.80,
  5: 2.00
};

// Maximum monthly fuel spend for eBucks calculation
const MONTHLY_FUEL_SPEND_CAP = 3000.0;

// Inflation & discount rates
const FUEL_INFLATION = 0.10;   // 10% annual inflation
const DISCOUNT_RATE = 0.06;    // 6% discount rate (for PV)
```

## eBucks Benefits Calculation

The eBucks benefits calculation is implemented in both Python and JavaScript. It computes the present value of eBucks rewards over the loan term.

### Implementation (Lines 120-135 in app.py, Lines 140-154 in server.js)

```javascript
// Get the base eBucks rate based on the user's level
const baseRate = BASE_EBUCKS[level] || 0.0;
// Add additional rates if the user has insurance and/or financing
const insuranceRate = hasInsurance ? (INSURANCE_RATES[level] || 0.0) : 0.0;
const financingRate = hasFinancing ? (FINANCING_RATES[level] || 0.0) : 0.0;
// Calculate the total rate per liter
const totalRate = baseRate + insuranceRate + financingRate;

// Cap the fuel spend at R3000 for eBucks calculation
const effectiveFuelSpend = Math.min(monthlyFuelSpend, MONTHLY_FUEL_SPEND_CAP);
// Calculate qualifying liters
const qualifyingLitres = effectiveFuelSpend / fuelPrice;
// Calculate first year eBucks
const year1Ebucks = totalRate * qualifyingLitres * 12;
// Calculate present value of eBucks over the loan term
const pvEbucks = presentValueOfGrowingAnnuity(year1Ebucks, FUEL_INFLATION, DISCOUNT_RATE, loanTermYears);
```

## Carbon Tax Savings Calculation

This calculation estimates the carbon tax savings when switching from an ICE vehicle to an EV.

### Implementation (Lines 138-147 in app.py, Lines 157-166 in server.js)

```javascript
// Calculate annual liters of fuel consumed
const annualLitres = monthlyLitres * 12;
// Convert to tonnes of CO2
const annualTonnesCo2 = (annualLitres * CO2_PER_LITRE) / 1000.0;
let carbonTaxSavings = 0.0;
const currentYear = 2023;

// Calculate carbon tax for each year, accounting for increasing rates
for (let i = 0; i < loanTermYears; i++) {
  const year = currentYear + i;
  const rate = CARBON_TAX[year] || CARBON_TAX[Math.max(...Object.keys(CARBON_TAX).map(Number))];
  const annualCarbonCost = annualTonnesCo2 * rate;
  carbonTaxSavings += presentValue(annualCarbonCost, DISCOUNT_RATE, i + 1);
}
```

## Fuel Spend Savings Calculation

This section calculates how much a user saves on fuel costs when switching to an EV.

### Implementation (Lines 87-114 in app.py, Lines 108-134 in server.js)

```javascript
// Calculate fuel consumption for ICE vehicle
const consumptionRate = FUEL_CONSUMPTION[fuelType] || 7.5;
const monthlyLitres = (consumptionRate * distanceMonthly) / 100.0;
const fuelPrice = FUEL_PRICES[fuelType] || 22.0;
const monthlyFuelSpend = monthlyLitres * fuelPrice;

// Calculate annual fuel cost with inflation
const year1FuelCost = monthlyFuelSpend * 12;
let pvFuelCost = 0.0;
for (let i = 0; i < loanTermYears; i++) {
  const costYear = year1FuelCost * Math.pow(1 + FUEL_INFLATION, i);
  pvFuelCost += presentValue(costYear, DISCOUNT_RATE, i + 1);
}

// Calculate EV charging costs
const annualEvCost = distanceMonthly * 12 * EV_CONSUMPTION * ESKOM_RATE;
const pvEvCost = hasSolar ? 0.0 : Array.from({ length: loanTermYears }, (_, i) => 
  presentValue(annualEvCost, DISCOUNT_RATE, i + 1)
).reduce((a, b) => a + b, 0);

// Calculate fuel spend savings
const fuelSpendSavings = pvFuelCost - pvEvCost;
```

## Present Value Calculations

These helper functions are used to calculate the present value of future cash flows.

### Implementation (Lines 48-57 in app.py, Lines 49-58 in server.js)

```javascript
// Calculate present value of a growing annuity
function presentValueOfGrowingAnnuity(cashFlow, growthRate, discountRate, periods) {
  if (Math.abs(growthRate - discountRate) < 1e-9) {
    return cashFlow * periods / Math.pow(1 + discountRate, periods);
  } else {
    return cashFlow * ((Math.pow(1 + growthRate, periods) - Math.pow(1 + discountRate, periods)) / (growthRate - discountRate)) / Math.pow(1 + discountRate, periods);
  }
}

// Calculate present value of a single future cash flow
function presentValue(cashFlow, discountRate, yearIndex) {
  return cashFlow / Math.pow(1 + discountRate, yearIndex);
}
```

## Vehicle Comparison Calculations

The vehicle comparison functionality is implemented in the `ComparisonTab.tsx` file. It allows users to compare an electric vehicle with a petrol vehicle based on AutoTrader listings.

### Key Functions:

1. **Monthly Loan Payment Calculation** (Lines 93-96 in ComparisonTab.tsx)
```typescript
const computeMonthlyPayment = (principal: number, annualRate: number, termMonths: number): number => {
  const monthlyRate = annualRate / 100 / 12;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
};
```

2. **Fuel Cost Calculation** (Lines 99-115 in ComparisonTab.tsx)
```typescript
const computeFuelCost = (carDetails: CarDetails, distance: number, useSolar: boolean): { cost: number; emissions: number } => {
  if (carDetails.fuelType.toLowerCase().includes('electric')) {
    if (useSolar) {
      return { cost: 0, emissions: 0 };
    } else {
      const energyUsed = (distance / 100) * carDetails.fuelEfficiency;
      const cost = energyUsed * 2.50; // R2.50 per kWh
      const emissions = energyUsed * 0.096; // kg CO₂ per kWh (coal-based)
      return { cost, emissions };
    }
  } else {
    const litersUsed = (distance / 100) * carDetails.fuelEfficiency;
    const cost = litersUsed * 21.0; // R21 per liter
    const emissions = litersUsed * 2.31; // kg CO₂ per liter
    return { cost, emissions };
  }
};
```

3. **Cumulative Fuel Cost Calculation** (Lines 118-133 in ComparisonTab.tsx)
```typescript
const generateCumulativeFuelCost = (initialFuelCost: number, totalPeriod: number, fuelType: string): number[] => {
  const annualInflation = fuelType.toLowerCase().includes('electric') ? 0.05 : 0.10;
  const monthlyInflation = Math.pow(1 + annualInflation, 1/12);
  
  const cumulative = [];
  let cumFuel = 0;
  
  for (let m = 1; m <= totalPeriod; m++) {
    const inflatedCost = initialFuelCost * Math.pow(monthlyInflation, m - 1);
    cumFuel += inflatedCost;
    cumulative.push(cumFuel);
  }
  
  return cumulative;
};
```

## Web Scraping Implementation

The application uses web scraping to fetch vehicle details from Autotrader. The implementation is in the `server.js` file.

### Implementation (Lines 85-147 in server.js)

```javascript
async function scrapeCarDetails(url) {
  try {
    console.log(`Scraping vehicle data from URL: ${url}`);
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    const response = await axios.get(url, { headers });
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch page, status code: ${response.status}`);
    }
    
    const $ = cheerio.load(response.data);
    
    // Extract Price
    let price = 300000.0; // Default price
    const priceDiv = $('.e-price');
    if (priceDiv.length > 0) {
      const priceText = priceDiv.text().trim();
      console.log(`Found price text: ${priceText}`);
      const priceClean = priceText.replace(/[^\d,.]/g, '').replace(',', '');
      if (!isNaN(parseFloat(priceClean))) {
        price = parseFloat(priceClean);
        console.log(`Parsed price: R${price}`);
      }
    } else {
      console.log('Price element not found, using default');
    }
    
    // Extract Specifications: Fuel Consumption and Fuel Type
    let fuelConsumption = null;
    let fuelType = null;
    
    $('.row.b-category-row__zYglO4HKfI2P9Ag8').each(function() {
      const spans = $(this).find('span.col-6.e-category-column__VfANtQmisFrqlAq0');
      if (spans.length >= 2) {
        const label = $(spans[0]).text().trim();
        const value = $(spans[1]).text().trim();
        
        console.log(`Found spec: ${label} = ${value}`);
        
        if (label.includes('Fuel consumption')) {
          const parts = value.split(' ');
          if (parts.length > 0) {
            const consumptionStr = parts[0].replace(',', '.');
            if (!isNaN(parseFloat(consumptionStr))) {
              fuelConsumption = parseFloat(consumptionStr);
              console.log(`Parsed fuel consumption: ${fuelConsumption}`);
            }
          }
        }
        
        if (label.includes('Fuel type')) {
          fuelType = value.trim();
          console.log(`Found fuel type: ${fuelType}`);
        }
      }
    });
    
    // Set defaults if values not found
    if (fuelConsumption === null) {
      fuelConsumption = (fuelType === null || fuelType.includes('Petrol')) ? 8.0 : 20.0;
      console.log(`Using default fuel consumption: ${fuelConsumption}`);
    }
    
    if (fuelType === null) {
      fuelType = url.toLowerCase().includes('electric') ? 'Electric' : 'Petrol';
      console.log(`Using default fuel type: ${fuelType}`);
    }
    
    return {
      price,
      fuelEfficiency: fuelConsumption,
      fuelType
    };
  } catch (error) {
    console.error('Error scraping car details:', error);
    return null;
  }
}
```

### Web Scraping API Endpoint (Lines 178-201 in server.js)

```javascript
// Vehicle scraping endpoint
app.post('/scrape-vehicle', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log(`Received scraping request for URL: ${url}`);
    const carDetails = await scrapeCarDetails(url);
    
    if (!carDetails) {
      return res.status(404).json({ error: 'Failed to extract vehicle details' });
    }
    
    console.log(`Successfully scraped vehicle:`, carDetails);
    res.json(carDetails);
  } catch (error) {
    console.error('Error in /scrape-vehicle endpoint:', error);
    res.status(500).json({ error: 'Server error while scraping vehicle details' });
  }
});
```

## Calculation Assumptions

The calculator relies on various assumptions to produce its estimates. These should be considered when interpreting the results:

1. **Fuel Prices and Consumption**
   - Diesel: R22.00/L with consumption of 6.5L/100km
   - Petrol 95: R23.00/L with consumption of 7.5L/100km
   - Petrol 93: R22.70/L with consumption of 7.3L/100km

2. **EV Energy Consumption** 
   - Assumed at 0.2 kWh/km
   - Electricity rate of R1.50/kWh for grid charging
   - Zero cost when solar power is selected

3. **eBucks Rewards**
   - Base rates from R0.40 to R4.00 per liter depending on level
   - Additional rewards for insurance (R0.10 to R2.00 per liter)
   - Additional rewards for financing (R0.10 to R2.00 per liter)
   - Monthly fuel spend capped at R3,000 for rewards calculation

4. **Financial Assumptions**
   - Fuel price inflation: 10% annually
   - Discount rate for present value calculations: 6%
   - Projections calculated over 5-7 years (adjustable)

5. **Carbon Emissions**
   - CO₂ emissions: 2.31 kg per liter of fuel
   - Carbon tax rates increasing from R159 to R495 per tonne over time
   - For EVs, emissions calculated based on grid electricity at 0.096 kg CO₂ per kWh (zero with solar)

6. **Vehicle Comparison**
   - Web scraping assumes AutoTrader's website structure remains stable
   - Default consumption values used when information can't be scraped (8.0L/100km for petrol, 20.0kWh/100km for electric)
   - Loan payment calculation uses standard amortization formula

All calculations are estimates and may vary from actual real-world performance based on driving conditions, vehicle specifications, and market conditions.