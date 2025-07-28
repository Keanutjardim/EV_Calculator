// Constants from server/app logic
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
  1: 0.20 * 0.75,
  2: 0.40 * 0.75,
  3: 0.80 * 0.75,
  4: 2.0 * 0.75,
  5: 4.00 * 0.75
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
const FUEL_INFLATION = 0.075; // 7.5% annual inflation
const ELECTRICITY_INFLATION = 0.1062; // 10.62% annual for electricity costs
const DISCOUNT_RATE = 0.1095; // 10.95% as requested
const DEFAULT_YEARS = 5;

const CARBON_TAX = {
  2025: 236,
  2026: 308,
  2027: 347,
  2028: 390,
  2029: 440,
  2030: 495,
  2031: 495,
  2032: 495
};

const CO2_PER_LITRE = 2.35;
const EV_CONSUMPTION = 0.189;
const STANDARD_ESKOM_RATE = 3.7;
const PREMIUM_ESKOM_RATE = 7.0;
const ESKOM_RATE = (STANDARD_ESKOM_RATE * 0.9) + (PREMIUM_ESKOM_RATE * 0.1);

// CO2 emission factors
const CO2_GRID = 0.9;   // 0.9 kg CO2 per kWh for grid electricity
const CO2_SOLAR = 0.09;  // 0.09 kg CO2 per kWh for solar (not zero)

// Helper Functions
export function presentValueOfGrowingAnnuity(cashFlow: number, growthRate: number, discountRate: number, periods: number): number {
  if (Math.abs(growthRate - discountRate) < 1e-9) {
    return cashFlow * periods / Math.pow(1 + discountRate, periods);
  } else {
    return cashFlow * ((Math.pow(1 + growthRate, periods) - Math.pow(1 + discountRate, periods)) / (growthRate - discountRate)) / Math.pow(1 + discountRate, periods);
  }
}

export function presentValue(cashFlow: number, discountRate: number, yearIndex: number): number {
  return cashFlow / Math.pow(1 + discountRate, yearIndex);
}

export function calculateMonthlyCO2(distance: number, fuelType: string): number {
  const consumptionRate = FUEL_CONSUMPTION[fuelType as keyof typeof FUEL_CONSUMPTION] || 9.0;
  const monthlyLitres = (consumptionRate * distance) / 100.0;
  const monthlyCO2 = monthlyLitres * CO2_PER_LITRE;
  return monthlyCO2;
}

export function calculateStandardUpfrontBenefits(distance: number, fuelType: string, ebucksLevel = 4) {
  const consumptionRate = FUEL_CONSUMPTION[fuelType as keyof typeof FUEL_CONSUMPTION] || 9.0;
  const monthlyLitres = (consumptionRate * distance) / 100.0;
  const fuelPrice = FUEL_PRICES[fuelType as keyof typeof FUEL_PRICES] || 21.62;
  const monthlyFuelSpend = monthlyLitres * fuelPrice;
  
  // Get eBucks rates
  const baseRate = BASE_EBUCKS[ebucksLevel as keyof typeof BASE_EBUCKS] || 0.0;
  const insuranceRate = INSURANCE_RATES[ebucksLevel as keyof typeof INSURANCE_RATES] || 0.0;
  const financingRate = FINANCING_RATES[ebucksLevel as keyof typeof FINANCING_RATES] || 0.0;
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
    const rate = CARBON_TAX[year as keyof typeof CARBON_TAX] || CARBON_TAX[Math.max(...Object.keys(CARBON_TAX).map(Number)) as keyof typeof CARBON_TAX];
    const annualCarbonCost = annualTonnesCo2 * rate;
    carbonTaxSavings += presentValue(annualCarbonCost, DISCOUNT_RATE, i + 1);
  }
  
  // Calculate PV of eBucks
  const pvEbucks = presentValueOfGrowingAnnuity(year1Ebucks, FUEL_INFLATION, DISCOUNT_RATE, 5);
  const upfrontSavings = pvEbucks + carbonTaxSavings;
  
  return {
    presentValueEbucks: Math.round(pvEbucks * 100) / 100,
    carbonTaxSavings: Math.round(carbonTaxSavings * 100) / 100,
    upfrontSavings: Math.round(upfrontSavings * 100) / 100
  };
}

type CalculationInput = {
  ebucksLevel: number;
  fuelType: string;
  distance: number;
  hasInsurance: boolean;
  hasFinancing: boolean;
  hasSolar: boolean;
  hasNoBank: boolean;
  loanTermYears: number;
};

// Add cumulative cost calculation function
export function calculateCumulativeCost(monthlyBaseCost: number, annualInflation: number, months: number): number {
  let total = 0;
  
  // Calculate cumulative cost by summing monthly costs with inflation applied
  for (let month = 0; month < months; month++) {
    // Apply inflation: original cost * (1 + inflation)^(month/12)
    const inflatedMonthlyCost = monthlyBaseCost * Math.pow(1 + annualInflation, month/12);
    total += inflatedMonthlyCost;
  }
  
  return total;
}

export function calculateSavings(data: CalculationInput) {
  // Parse Inputs
  const level = data.ebucksLevel;
  const fuelType = data.fuelType;
  const distanceMonthly = data.distance;
  const hasInsurance = data.hasInsurance;
  const hasFinancing = data.hasFinancing;
  const hasSolar = data.hasSolar;
  const hasNoBank = data.hasNoBank;
  const loanTermYears = data.loanTermYears || DEFAULT_YEARS;

  // 1. ICE Fuel Consumption & Costs
  const consumptionRate = FUEL_CONSUMPTION[fuelType as keyof typeof FUEL_CONSUMPTION] || 9.0;
  const monthlyLitres = (consumptionRate * distanceMonthly) / 100.0;
  const fuelPrice = FUEL_PRICES[fuelType as keyof typeof FUEL_PRICES] || 21.62;
  const monthlyFuelSpend = monthlyLitres * fuelPrice;
  
  // Calculate monthly EV charging cost
  const monthlyChargingRate = ESKOM_RATE; // (STANDARD_ESKOM_RATE * 0.9) + (PREMIUM_ESKOM_RATE * 0.1)
  const monthlyEvConsumption = distanceMonthly * EV_CONSUMPTION; // kWh per month
  const baseMonthlyChargingCost = monthlyEvConsumption * monthlyChargingRate;
  
  // Calculate monthly charging cost with solar if applicable
  const monthlyChargingCost = hasSolar ? baseMonthlyChargingCost * 0.1 : baseMonthlyChargingCost;
  
  // Calculate nominal cumulative costs over the loan term (not discounted)
  const totalMonths = loanTermYears * 12;
  const cumFuel = calculateCumulativeCost(monthlyFuelSpend, FUEL_INFLATION, totalMonths);
  const cumCharge = calculateCumulativeCost(monthlyChargingCost, ELECTRICITY_INFLATION, totalMonths);
  const rawFuelSpendSavings = Number((cumFuel - cumCharge).toFixed(2));

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
  const fuelSpendSavings = rawFuelSpendSavings - pvEvCost;

  // 3. eBucks Calculation
  let baseRate = 0;
  let insuranceRate = 0;
  let financingRate = 0;
  
  // Only apply banking benefits if hasNoBank is false
  if (!hasNoBank) {
    baseRate = BASE_EBUCKS[level as keyof typeof BASE_EBUCKS] || 0.0;
    insuranceRate = hasInsurance ? (INSURANCE_RATES[level as keyof typeof INSURANCE_RATES] || 0.0) : 0.0;
    financingRate = hasFinancing ? (FINANCING_RATES[level as keyof typeof FINANCING_RATES] || 0.0) : 0.0;
  }
  
  const totalRate = baseRate + insuranceRate + financingRate;

  const effectiveFuelSpend = Math.min(monthlyFuelSpend, MONTHLY_FUEL_SPEND_CAP);
  const qualifyingLitres = effectiveFuelSpend / fuelPrice;
  const year1Ebucks = totalRate * qualifyingLitres * 12;
  
  // Always calculate for 5 years for upfront benefits
  const pvEbucks = presentValueOfGrowingAnnuity(year1Ebucks, FUEL_INFLATION, DISCOUNT_RATE, 5);

  // 4. Carbon Tax Savings
  let carbonTaxSavings = 0.0;
  if (!hasNoBank) {
    const annualLitres = monthlyLitres * 12;
    const annualTonnesCo2 = (annualLitres * CO2_PER_LITRE) / 1000.0;
    const currentYear = 2025;
    for (let i = 0; i < 5; i++) {
      const year = currentYear + i;
      const rate = CARBON_TAX[year as keyof typeof CARBON_TAX] || CARBON_TAX[Math.max(...Object.keys(CARBON_TAX).map(Number)) as keyof typeof CARBON_TAX];
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
  
  // EV emissions calculation
  let evMonthlyEmissions = 0;
  if (hasSolar) {
    evMonthlyEmissions = distanceMonthly * EV_CONSUMPTION * CO2_SOLAR;
  } else {
    evMonthlyEmissions = distanceMonthly * EV_CONSUMPTION * CO2_GRID;
  }
  
  const monthlyCO2Savings = iceMonthlyEmissions - evMonthlyEmissions;
  const yearlyCO2Savings = monthlyCO2Savings * 12;

  // Return values with 2 decimal places
  return {
    presentValueEbucks: Number(pvEbucks.toFixed(2)),
    carbonTaxSavings: Number(carbonTaxSavings.toFixed(2)),
    fuelSpendSavings: rawFuelSpendSavings,
    upfrontSavings: Number(upfrontSavings.toFixed(2)),
    totalSavings: Number((upfrontSavings + rawFuelSpendSavings).toFixed(2)),
    standardUpfrontBenefits: {
      presentValueEbucks: Number(standardUpfrontBenefits.presentValueEbucks.toFixed(2)),
      carbonTaxSavings: Number(standardUpfrontBenefits.carbonTaxSavings.toFixed(2)),
      upfrontSavings: Number(standardUpfrontBenefits.upfrontSavings.toFixed(2))
    },
    co2Emissions: {
      ice: Number(iceMonthlyEmissions.toFixed(2)),
      ev: Number(evMonthlyEmissions.toFixed(2)),
      monthlySavings: Number(monthlyCO2Savings.toFixed(2)),
      yearlySavings: Number(yearlyCO2Savings.toFixed(2))
    }
  };
}