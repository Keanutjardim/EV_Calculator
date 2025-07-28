import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Data & Constants
const FUEL_PRICES = {
  'diesel': 19.32,
  'petrol95': 21.62,
  'petrol93': 21.51
};

const FUEL_CONSUMPTION = {
  'diesel': 8,
  'petrol95': 9,
  'petrol93': 9
};

const BASE_EBUCKS = {
  1: 0.20*0.75,
  2: 0.40*0.75,
  3: 0.80*0.75,
  4: 2.00*0.75,
  5: 4.00*0.75
};

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

const MONTHLY_FUEL_SPEND_CAP = 3000.0;
const FUEL_INFLATION = 0.09; // 9% annual inflation
const DISCOUNT_RATE = 0.1095; // Updated to 10.95% as requested
const DEFAULT_YEARS = 5;

const CARBON_TAX = {
  2025: 236,
  2026: 308,
  2027: 347,
  2028: 390, /* Extended for longer loan terms */
  2029: 440,
  2030: 495,
  2031: 495,
  2032: 495
};

const CO2_PER_LITRE = 2.35;
const EV_CONSUMPTION = 0.189;
const STANDARD_ESKOM_RATE = 3.7;
const PREMIUM_ESKOM_RATE = 7.0;
// Combined rate: 90% standard, 10% premium
const ESKOM_RATE = (STANDARD_ESKOM_RATE * 0.9) + (PREMIUM_ESKOM_RATE * 0.1);

// CO2 emission factors
const CO2_GRID = 0.9;   // 0.9 kg CO2 per kWh for grid electricity
const CO2_SOLAR = 0.09;  // 0.09 kg CO2 per kWh for solar (not zero)

// Helper Functions
function presentValueOfGrowingAnnuity(cashFlow, growthRate, discountRate, periods) {
  if (Math.abs(growthRate - discountRate) < 1e-9) {
    return cashFlow * periods / Math.pow(1 + discountRate, periods);
  } else {
    return cashFlow * ((Math.pow(1 + growthRate, periods) - Math.pow(1 + discountRate, periods)) / (growthRate - discountRate)) / Math.pow(1 + discountRate, periods);
  }
}

function presentValue(cashFlow, discountRate, yearIndex) {
  return cashFlow / Math.pow(1 + discountRate, yearIndex);
}

// Vehicle Scraping Function with improved error handling
async function scrapeCarDetails(url) {
  try {
    console.log(`Scraping vehicle data from URL: ${url}`);
    
    // Use a modern user agent
    const headers = { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    };
    
    // Add timeout to prevent hanging requests
    const response = await axios.get(url, { 
      headers, 
      timeout: 15000,  // 15 seconds timeout
      maxRedirects: 5
    });
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch page, status code: ${response.status}`);
    }
    
    const $ = cheerio.load(response.data);
    
    // Extract Price - try multiple selectors to find the price
    let price = null;
    const priceSelectors = [
      '.e-price', 
      '.price', 
      '.vehicle-price', 
      '.car-price', 
      'span.price', 
      'div.price',
      // Look for anything with "R" followed by numbers
      'span:contains("R")',
      'div:contains("R")',
      'h1:contains("R")',
      'h2:contains("R")',
      'h3:contains("R")'
    ];
    
    for (const selector of priceSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        for (let i = 0; i < elements.length; i++) {
          const text = $(elements[i]).text().trim();
          // Look for price pattern like "R 750,000" or "R750000"
          const match = text.match(/R\s?([0-9,\s]+)/i);
          if (match) {
            const priceStr = match[1].replace(/[^\d.-]/g, '');
            const parsedPrice = parseFloat(priceStr);
            if (!isNaN(parsedPrice) && parsedPrice > 0) {
              price = parsedPrice;
              console.log(`Found price with selector ${selector}: R${price}`);
              break;
            }
          }
        }
        if (price !== null) break;
      }
    }
    
    // Extract fuel type and consumption
    let fuelType = null;
    let fuelConsumption = null;
    
    // Try specific selectors first
    const specSelectors = [
      '.specs', 
      '.specifications', 
      '.details', 
      'table', 
      'dl',
      '.row.b-category-row__zYglO4HKfI2P9Ag8',
      'div.specs',
      'ul.specs'
    ];
    
    for (const selector of specSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`Found specification element with selector: ${selector}`);
        
        // Look for text that indicates fuel type
        const fullText = elements.text().toLowerCase();
        
        // Check if it's an electric vehicle by looking for keywords
        if (fullText.includes('electric') || 
            fullText.includes('battery') || 
            fullText.includes('kw/h') || 
            fullText.includes('kwh') || 
            fullText.includes('ev')) {
          fuelType = 'Electric';
          console.log('Identified as electric vehicle from specs');
        }
        // Check for petrol/diesel indicators
        else if (fullText.includes('petrol')) {
          fuelType = 'Petrol';
          console.log('Identified as petrol vehicle from specs');
        }
        else if (fullText.includes('diesel')) {
          fuelType = 'Diesel';
          console.log('Identified as diesel vehicle from specs');
        }
        
        // Look for consumption data
        const consumptionRegex = /(\d+[.,]?\d*)\s*(l\/100km|kwh\/100km|litres\/100km|kw\/100km)/i;
        const consumptionMatch = fullText.match(consumptionRegex);
        if (consumptionMatch) {
          fuelConsumption = parseFloat(consumptionMatch[1].replace(',', '.'));
          console.log(`Found fuel consumption: ${fuelConsumption}`);
        }
      }
    }
    
    // If we still don't have fuel type, infer from URL and full page content
    if (fuelType === null) {
      const pageText = $('body').text().toLowerCase();
      const isElectric = url.toLowerCase().includes('electric') || 
                         url.toLowerCase().includes('ev') || 
                         pageText.includes('electric vehicle') || 
                         pageText.includes('battery capacity') ||
                         pageText.includes('kwh') ||
                         pageText.includes('charging');
      
      fuelType = isElectric ? 'Electric' : 'Petrol';
      console.log(`Inferred fuel type from page content: ${fuelType}`);
    }
    
    // For missing consumption, use appropriate defaults based on fuel type
    if (fuelConsumption === null) {
      if (fuelType === 'Electric') {
        fuelConsumption = 18.0; // kWh/100km for EVs
        console.log(`Using default EV consumption: ${fuelConsumption} kWh/100km`);
      } else if (fuelType === 'Diesel') {
        fuelConsumption = 7.0; // L/100km for Diesel
        console.log(`Using default Diesel consumption: ${fuelConsumption} L/100km`);
      } else {
        fuelConsumption = 8.5; // L/100km for Petrol
        console.log(`Using default Petrol consumption: ${fuelConsumption} L/100km`);
      }
    }
    
    // For missing price, use appropriate defaults
    if (price === null) {
      price = fuelType === 'Electric' ? 750000 : 350000;
      console.log(`Using default price for ${fuelType}: R${price}`);
    }
    
    const result = {
      price,
      fuelEfficiency: fuelConsumption,
      fuelType
    };
    
    console.log('Successfully scraped vehicle data:', result);
    return result;
  } catch (error) {
    console.error('Error scraping car details:', error.message);
    
    // Determine if it's likely an electric vehicle from the URL
    const isElectric = url.toLowerCase().includes('electric') || url.toLowerCase().includes('ev');
    
    // Return appropriate fallback data
    const fallbackData = {
      price: isElectric ? 750000 : 350000,
      fuelEfficiency: isElectric ? 18.0 : 8.5,
      fuelType: isElectric ? 'Electric' : 'Petrol',
      isMockData: true
    };
    
    console.log('Using fallback data:', fallbackData);
    return fallbackData;
  }
}

// Calculate CO2 emissions per month for given distance and fuel type
function calculateMonthlyCO2(distance, fuelType) {
  const consumptionRate = FUEL_CONSUMPTION[fuelType] || 9.0;
  const monthlyLitres = (consumptionRate * distance) / 100.0;
  const monthlyCO2 = monthlyLitres * CO2_PER_LITRE;
  return monthlyCO2;
}

// Calculate standard five-year upfront benefits (for comparison)
function calculateStandardUpfrontBenefits(distance, fuelType, ebucksLevel = 4) {
  const consumptionRate = FUEL_CONSUMPTION[fuelType] || 9.0;
  const monthlyLitres = (consumptionRate * distance) / 100.0;
  const fuelPrice = FUEL_PRICES[fuelType] || 21.62;
  const monthlyFuelSpend = monthlyLitres * fuelPrice;
  
  // Get eBucks rates
  const baseRate = BASE_EBUCKS[ebucksLevel] || 0.0;
  const insuranceRate = INSURANCE_RATES[ebucksLevel] || 0.0;
  const financingRate = FINANCING_RATES[ebucksLevel] || 0.0;
  const totalRate = baseRate + insuranceRate + financingRate;
  
  // Calculate eBucks
  const effectiveFuelSpend = Math.min(monthlyFuelSpend, MONTHLY_FUEL_SPEND_CAP);
  const qualifyingLitres = effectiveFuelSpend / fuelPrice;
  const year1Ebucks = totalRate * qualifyingLitres * 12;
  
  // Calculate carbon tax
  const annualLitres = monthlyLitres * 12;
  const annualTonnesCo2 = (annualLitres * CO2_PER_LITRE) / 1000.0;
  let carbonTaxSavings = 0.0;
  const currentYear = 2025;
  for (let i = 0; i < 5; i++) {
    const year = currentYear + i;
    const rate = CARBON_TAX[year] || CARBON_TAX[Math.max(...Object.keys(CARBON_TAX).map(Number))];
    const annualCarbonCost = annualTonnesCo2 * rate;
    carbonTaxSavings += presentValue(annualCarbonCost, DISCOUNT_RATE, i + 1);
  }
  
  // Calculate 5-year PV of eBucks
  const pvEbucks = presentValueOfGrowingAnnuity(year1Ebucks, FUEL_INFLATION, DISCOUNT_RATE, 5);
  const upfrontSavings = pvEbucks + carbonTaxSavings;
  
  return {
    presentValueEbucks: Math.round(pvEbucks * 100) / 100,
    carbonTaxSavings: Math.round(carbonTaxSavings * 100) / 100,
    upfrontSavings: Math.round(upfrontSavings * 100) / 100
  };
}

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

// Serve static files for wesbank logo
app.use(express.static(path.join(__dirname, 'public')));

// Vehicle scraping endpoint with improved error handling
app.post('/scrape-vehicle', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'URL is required',
        message: 'Please provide a valid URL to scrape vehicle details'
      });
    }
    
    console.log(`Received scraping request for URL: ${url}`);
    const carDetails = await scrapeCarDetails(url);
    
    // Return the scraped data - should always return valid data or fallbacks
    console.log(`Returning vehicle data:`, carDetails);
    res.json(carDetails);
  } catch (error) {
    console.error('Error in /scrape-vehicle endpoint:', error);
    
    // Determine if it's likely an electric vehicle from the URL
    const isElectric = req.body.url?.toLowerCase().includes('electric') || 
                       req.body.url?.toLowerCase().includes('ev');
    
    // Return appropriate fallback data
    const fallbackData = {
      price: isElectric ? 750000 : 350000,
      fuelEfficiency: isElectric ? 18.0 : 8.5,
      fuelType: isElectric ? 'Electric' : 'Petrol',
      isMockData: true,
      message: 'Error occurred while scraping, using estimated values'
    };
    
    return res.json(fallbackData);
  }
});

// API Routes
app.post('/calculate', (req, res) => {
  try {
    const data = req.body;
    if (!data) {
      return res.status(400).json({
        error: "No data provided",
        presentValueEbucks: 0,
        carbonTaxSavings: 0,
        fuelSpendSavings: 0,
        upfrontSavings: 0,
        totalSavings: 0,
        standardUpfrontBenefits: {
          presentValueEbucks: 0,
          carbonTaxSavings: 0,
          upfrontSavings: 0
        },
        co2Emissions: {
          ice: 0,
          ev: 0,
          monthlySavings: 0,
          yearlySavings: 0
        }
      });
    }

    // Parse Inputs
    const level = parseInt(data.ebucksLevel);
    const fuelType = data.fuelType;
    const distanceMonthly = parseFloat(data.distance);
    const hasInsurance = data.hasInsurance;
    const hasFinancing = data.hasFinancing;
    const hasSolar = data.hasSolar;
    const hasNoBank = data.hasNoBank || false;
    const loanTermYears = data.loanTermYears || DEFAULT_YEARS; // Use provided term or default to 5 years

    // 1. ICE Fuel Consumption & Costs
    const consumptionRate = FUEL_CONSUMPTION[fuelType] || 9.0;
    const monthlyLitres = (consumptionRate * distanceMonthly) / 100.0;
    const fuelPrice = FUEL_PRICES[fuelType] || 21.62;
    const monthlyFuelSpend = monthlyLitres * fuelPrice;

    // Annual fuel cost calculations
    const year1FuelCost = monthlyFuelSpend * 12;
    let pvFuelCost = 0.0;
    for (let i = 0; i < loanTermYears; i++) {
      const costYear = year1FuelCost * Math.pow(1 + FUEL_INFLATION, i);
      pvFuelCost += presentValue(costYear, DISCOUNT_RATE, i + 1);
    }

    // 2. EV Charging Costs
    const annualEvCost = distanceMonthly * 12 * EV_CONSUMPTION * ESKOM_RATE;
    let pvEvCost = 0.0; 
    
    // With solar, charging cost is 1/10 of normal instead of zero
    if (hasSolar) {
      const solarEvCost = annualEvCost * 0.1;  // 10% of normal cost
      pvEvCost = Array.from({ length: loanTermYears }, (_, i) => 
        presentValue(solarEvCost, DISCOUNT_RATE, i + 1)
      ).reduce((a, b) => a + b, 0);
    } else {
      pvEvCost = Array.from({ length: loanTermYears }, (_, i) => 
        presentValue(annualEvCost, DISCOUNT_RATE, i + 1)
      ).reduce((a, b) => a + b, 0);
    }

    // Fuel Spend Savings
    const fuelSpendSavings = pvFuelCost - pvEvCost;

    // 3. eBucks Calculation
    let baseRate = 0;
    let insuranceRate = 0;
    let financingRate = 0;
    
    // Only apply banking benefits if hasNoBank is false
    if (!hasNoBank) {
      baseRate = BASE_EBUCKS[level] || 0.0;
      insuranceRate = hasInsurance ? (INSURANCE_RATES[level] || 0.0) : 0.0;
      financingRate = hasFinancing ? (FINANCING_RATES[level] || 0.0) : 0.0;
    }
    
    const totalRate = baseRate + insuranceRate + financingRate;

    const effectiveFuelSpend = Math.min(monthlyFuelSpend, MONTHLY_FUEL_SPEND_CAP);
    const qualifyingLitres = effectiveFuelSpend / fuelPrice;
    const year1Ebucks = totalRate * qualifyingLitres * 12;
    
    // Always calculate for 5 years for upfront benefits
    const pvEbucks = presentValueOfGrowingAnnuity(year1Ebucks, FUEL_INFLATION, DISCOUNT_RATE, 5);

    // 4. Carbon Tax Savings
    // If hasNoBank is true, no carbon tax savings either
    let carbonTaxSavings = 0.0;
    if (!hasNoBank) {
      const annualLitres = monthlyLitres * 12;
      const annualTonnesCo2 = (annualLitres * CO2_PER_LITRE) / 1000.0;
      const currentYear = 2025; // Updated to start from 2025
      for (let i = 0; i < 5; i++) { // Always calculate for 5 years for carbon tax
        const year = currentYear + i;
        const rate = CARBON_TAX[year] || CARBON_TAX[Math.max(...Object.keys(CARBON_TAX).map(Number))];
        const annualCarbonCost = annualTonnesCo2 * rate;
        carbonTaxSavings += presentValue(annualCarbonCost, DISCOUNT_RATE, i + 1);
      }
    }

    // 5. Breakdown of Savings
    const upfrontSavings = pvEbucks + carbonTaxSavings;
    const loanTermSavings = fuelSpendSavings;
    const totalSavings = upfrontSavings + loanTermSavings;
    
    // 6. Calculate standard upfront benefits for comparison
    const standardUpfrontBenefits = calculateStandardUpfrontBenefits(distanceMonthly, fuelType);
    
    // 7. Calculate CO2 emissions
    const iceMonthlyEmissions = calculateMonthlyCO2(distanceMonthly, fuelType);
    
    // EV emissions calculation - CRITICAL FIX
    // Always use CO2_SOLAR (0.09) for solar and CO2_GRID (0.9) for grid electricity
    let evMonthlyEmissions = 0;
    if (hasSolar) {
      evMonthlyEmissions = distanceMonthly * EV_CONSUMPTION * CO2_SOLAR;
      console.log(`Solar EV emissions: ${evMonthlyEmissions} kg CO2/month`);
    } else {
      evMonthlyEmissions = distanceMonthly * EV_CONSUMPTION * CO2_GRID;
      console.log(`Grid EV emissions: ${evMonthlyEmissions} kg CO2/month`);
    }
    
    const monthlyCO2Savings = iceMonthlyEmissions - evMonthlyEmissions;
    const yearlyCO2Savings = monthlyCO2Savings * 12;
    
    console.log(`Monthly CO2 savings: ${monthlyCO2Savings} kg`);

    res.json({
      presentValueEbucks: Math.round(pvEbucks * 100) / 100,
      carbonTaxSavings: Math.round(carbonTaxSavings * 100) / 100,
      fuelSpendSavings: Math.round(loanTermSavings * 100) / 100,
      upfrontSavings: Math.round(upfrontSavings * 100) / 100,
      totalSavings: Math.round(totalSavings * 100) / 100,
      standardUpfrontBenefits: standardUpfrontBenefits,
      co2Emissions: {
        ice: Math.round(iceMonthlyEmissions * 100) / 100,
        ev: Math.round(evMonthlyEmissions * 100) / 100,
        monthlySavings: Math.round(monthlyCO2Savings * 100) / 100,
        yearlySavings: Math.round(yearlyCO2Savings * 100) / 100
      }
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: `An error occurred: ${error.message}`,
      presentValueEbucks: 0,
      carbonTaxSavings: 0,
      fuelSpendSavings: 0,
      upfrontSavings: 0,
      totalSavings: 0,
      standardUpfrontBenefits: {
        presentValueEbucks: 0,
        carbonTaxSavings: 0,
        upfrontSavings: 0
      },
      co2Emissions: {
        ice: 0,
        ev: 0,
        monthlySavings: 0,
        yearlySavings: 0
      }
    });
  }
});

// Compute monthly payment for loan
app.post('/compute-payment', (req, res) => {
  try {
    const { principal, annualRate, termMonths } = req.body;
    
    if (!principal || !annualRate || !termMonths) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const monthlyRate = annualRate / 100 / 12;
    const payment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
    
    res.json({ monthlyPayment: payment });
  } catch (error) {
    console.error('Error computing payment:', error);
    res.status(500).json({ error: 'Server error computing payment' });
  }
});

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Serve static files from the React build directory
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
}

// Create a route for serving the React app
app.get('*', (req, res) => {
  // Send index.html for any requests not handled by API routes
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    res.send(`
      <html>
        <head>
          <title>EV Savings Calculator API</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #00a6b6; }
            pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; }
          </style>
        </head>
        <body>
          <h1>EV Savings Calculator API</h1>
          <p>This is the API server for the EV Savings Calculator.</p>
          <p>To use the calculator, please visit: <a href="http://localhost:5173">http://localhost:5173</a></p>
          
          <h2>Available Endpoints:</h2>
          <pre>
POST /calculate
Content-Type: application/json

{
  "ebucksLevel": 3,
  "fuelType": "petrol95",
  "distance": 1500,
  "hasInsurance": true,
  "hasFinancing": true,
  "hasSolar": false,
  "hasNoBank": false,
  "loanTermYears": 5
}
          </pre>
        </body>
      </html>
    `);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`React app available at http://localhost:5173`);
});