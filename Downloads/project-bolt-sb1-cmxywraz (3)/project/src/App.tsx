import React, { useState, useEffect } from 'react';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
} from 'chart.js';

// Import local calculation utilities for offline operation
import { calculateSavings, presentValueOfGrowingAnnuity } from './utils/calculationUtils';
import EVChargerMap from './components/EVChargerMap';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

function App() {
  const [activeTab, setActiveTab] = useState('calculate');
  const [vehicleValue, setVehicleValue] = useState<number>(835000);
  const [iceVehicleValue, setIceVehicleValue] = useState<number>(750000);
  const [evVehicleValue, setEvVehicleValue] = useState<number>(835000);
  const [showCarbonTax, setShowCarbonTax] = useState<boolean>(false);
  const [ebucksEnabled, setEbucksEnabled] = useState(false);
  const [distance, setDistance] = useState(1500);
  const [ebucksLevel, setEbucksLevel] = useState(3);
  const [fuelType, setFuelType] = useState('petrol95');
  const [hasInsurance, setHasInsurance] = useState(true);
  const [hasFinancing, setHasFinancing] = useState(true);
  const [hasSolar, setHasSolar] = useState(false);
  const [hasNoBank, setHasNoBank] = useState(false);
  const [loanTerm, setLoanTerm] = useState(60); // Loan term in months (default: 60 months = 5 years)
  const [vehicleType, setVehicleType] = useState<'hybrid' | 'phev' | 'ev'>('ev');
  const [phevBatteryCapacity, setPhevBatteryCapacity] = useState<number>(13.8); // kWh
  const [phevFuelTankSize, setPhevFuelTankSize] = useState<number>(45); // Liters
  const [error, setError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [results, setResults] = useState({
    totalSavings: 0,
    upfrontSavings: 0,
    fuelSpendSavings: 0,
    presentValueEbucks: 0,
    carbonTaxSavings: 0,
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

  // Constants for CO2 calculations
  const CO2_GRID = 0.9;   // 0.9 kg CO2 per kWh for grid electricity
  const CO2_SOLAR = 0.09;  // 0.09 kg CO2 per kWh for solar (not zero)

  // Vehicle efficiency data
  const vehicleEfficiencyData = {
    ice: {
      fuelConsumption: { petrol95: 9, petrol93: 9, diesel: 8 },
      co2Emissions: 2.35, // kg/L
      maintenanceCost: 0.15, // R/km
    },
    hybrid: {
      fuelConsumption: { petrol95: 5.4, petrol93: 5.4, diesel: 4.8 }, // 40% reduction
      co2Emissions: 1.41, // kg/L (40% reduction)
      maintenanceCost: 0.12, // R/km
    },
    phev: {
      fuelConsumption: { petrol95: 3.2, petrol93: 3.2, diesel: 2.8 }, // Will be calculated dynamically
      co2Emissions: 1.2, // kg/L (will be calculated based on electric usage)
      maintenanceCost: 0.10, // R/km
      electricConsumption: 0.189, // kWh/km (same as EV)
    },
    ev: {
      fuelConsumption: { petrol95: 0, petrol93: 0, diesel: 0 },
      co2Emissions: 0,
      maintenanceCost: 0.08, // R/km
      electricConsumption: 0.189, // kWh/km
    }
  };

  // Effect to calculate savings on initial load and when loan term or other key inputs change
  useEffect(() => {
    handleCalculate();
  }, [loanTerm, distance, ebucksLevel, fuelType, hasInsurance, hasFinancing, hasSolar, hasNoBank, ebucksEnabled, iceVehicleValue, evVehicleValue, vehicleType, phevBatteryCapacity, phevFuelTankSize]);

  const handleCalculate = async () => {
    try {
      setError(null);
      setIsCalculating(true);

      const inputData = {
        distance,
        ebucksLevel,
        fuelType,
        hasInsurance,
        hasFinancing,
        hasSolar,
        hasNoBank,
        loanTermYears: loanTerm / 12 // Convert months to years for the API
      };

      try {
        // Try to call the API first
        const response = await fetch('/calculate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(inputData),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }
        
        setResults(data);
        setIsOfflineMode(false);
      } catch (apiError) {
        console.log('API call failed, using local calculations', apiError);
        
        // If API call fails, use local calculations
        const localResults = calculateSavings(inputData);
        setResults(localResults);
        setIsOfflineMode(true);
      }
    } catch (error) {
      console.error('Error calculating savings:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while calculating savings');
      setResults({
        totalSavings: 0,
        upfrontSavings: 0,
        fuelSpendSavings: 0,
        presentValueEbucks: 0,
        carbonTaxSavings: 0,
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
    } finally {
      setIsCalculating(false);
    }
  };

  // Get fuel consumption for the selected NEV (New Energy Vehicle)
  const getNEVFuelConsumption = () => {
    if (vehicleType === 'phev') {
      return calculatePHEVFuelConsumption();
    }
    
    return vehicleEfficiencyData[vehicleType].fuelConsumption[fuelType as keyof typeof vehicleEfficiencyData.ice.fuelConsumption];
  };

  // Get ICE fuel consumption (baseline for comparison)
  const getICEFuelConsumption = () => {
    return vehicleEfficiencyData.ice.fuelConsumption[fuelType as keyof typeof vehicleEfficiencyData.ice.fuelConsumption];
  };

  // Calculate PHEV fuel consumption based on battery and fuel tank capacity
  const calculatePHEVFuelConsumption = () => {
    const batteryRange = phevBatteryCapacity / vehicleEfficiencyData.phev.electricConsumption; // km on electric
    const fuelRange = phevFuelTankSize / vehicleEfficiencyData.ice.fuelConsumption[fuelType as keyof typeof vehicleEfficiencyData.ice.fuelConsumption] * 100; // km on fuel
    
    const totalRange = batteryRange + fuelRange;
    const electricPercentage = batteryRange / totalRange;
    const fuelPercentage = 1 - electricPercentage;
    
    // Weighted average consumption
    const weightedConsumption = (vehicleEfficiencyData.ice.fuelConsumption[fuelType as keyof typeof vehicleEfficiencyData.ice.fuelConsumption] * fuelPercentage) + 
                               (0 * electricPercentage); // Electric consumption is 0 L/100km
    
    return Math.max(weightedConsumption, 1.5); // Minimum 1.5 L/100km for PHEV
  };

  const getFuelPrice = () => {
    switch (fuelType) {
      case 'petrol95': return 21.62;
      case 'petrol93': return 21.51;
      case 'diesel': return 19.32;
      default: return 21.62;
    }
  };

  // Calculate monthly fuel cost for ICE vehicle (baseline)
  const calculateICEMonthlyFuelCost = () => {
    const consumptionRate = getICEFuelConsumption();
    const fuelPrice = getFuelPrice();
    return (consumptionRate * distance) / 100.0 * fuelPrice;
  };

  // Calculate monthly fuel cost for NEV
  const calculateNEVMonthlyFuelCost = () => {
    const consumptionRate = getNEVFuelConsumption();
    const fuelPrice = getFuelPrice();
    return (consumptionRate * distance) / 100.0 * fuelPrice;
  };

  // Calculate monthly eBucks rewards based on level and other factors
  const calculateMonthlyEbucksReward = (useLevel?: number, options?: {
    useInsurance?: boolean;
    useFinancing?: boolean;
    useNoBank?: boolean;
  }) => {
    // Base eBucks reward rates per liter based on level
    const baseEbucksRates = {
      1: 0.15, // 0.20 * 0.75
      2: 0.30, // 0.40 * 0.75
      3: 0.60, // 0.80 * 0.75
      4: 1.50, // 2.00 * 0.75
      5: 3.00  // 4.00 * 0.75
    };
    
    // Additional rates for insurance
    const insuranceRates = {
      1: 0.10,
      2: 0.20,
      3: 0.40,
      4: 1.00,
      5: 2.00
    };
    
    // Additional rates for financing
    const financingRates = {
      1: 0.10,
      2: 0.20,
      3: 0.40,
      4: 1.00,
      5: 2.00
    };
    
    const level = useLevel !== undefined ? useLevel : ebucksLevel;
    const useInsurance = options?.useInsurance !== undefined ? options.useInsurance : hasInsurance;
    const useFinancing = options?.useFinancing !== undefined ? options.useFinancing : hasFinancing;
    const useNoBank = options?.useNoBank !== undefined ? options.useNoBank : hasNoBank;
    
    // Start with base rate
    let rate = baseEbucksRates[level as keyof typeof baseEbucksRates];
    
    // Add insurance and financing benefits if eligible
    if (!useNoBank) {
      if (useInsurance) {
        rate += insuranceRates[level as keyof typeof insuranceRates];
      }
      
      if (useFinancing) {
        rate += financingRates[level as keyof typeof financingRates];
      }
    }
    
    const consumptionRate = getICEFuelConsumption();
    const monthlyLiters = (consumptionRate * distance) / 100.0;
    
    // Cap at R3000 fuel spend per month
    const monthlyCap = 3000;
    const monthlyFuelCost = calculateICEMonthlyFuelCost();
    const cappedLiters = monthlyFuelCost > monthlyCap 
      ? (monthlyCap / getFuelPrice()) 
      : monthlyLiters;
    
    return cappedLiters * rate;
  };

  // Calculate present value of eBucks benefits using annuity formula
  const calculatePresentValueEbucks = (useLevel?: number, options?: {
    useInsurance?: boolean;
    useFinancing?: boolean;
    useNoBank?: boolean;
  }) => {
    const monthlyEbucksAmount = calculateMonthlyEbucksReward(useLevel, options);
    
    // Use 10.95% discount rate for eBucks as specified
    const annualDiscountRate = 0.1095;
    const monthlyDiscountRate = annualDiscountRate / 12;
    
    // Calculate present value using annuity formula
    // Use 60 months (5 years) for eBucks benefits as standard
    const standardEbucksTerm = 60;
    
    // PV of monthly eBucks rewards as level annuity
    return monthlyEbucksAmount * 
      (1 - Math.pow(1 + monthlyDiscountRate, -standardEbucksTerm)) / 
      monthlyDiscountRate;
  };

  // Calculate monthly charging cost for EV and PHEV
  const calculateMonthlyChargingCost = () => {
    // 90% at standard rate, 10% at premium rate
    const standardRate = 3.7;
    const premiumRate = 7.0;
    const combinedRate = (standardRate * 0.9) + (premiumRate * 0.1);
    
    let electricConsumption = 0;
    
    if (vehicleType === 'ev') {
      electricConsumption = distance * vehicleEfficiencyData.ev.electricConsumption;
    } else if (vehicleType === 'phev') {
      // Calculate electric portion based on battery capacity
      const batteryRange = phevBatteryCapacity / vehicleEfficiencyData.phev.electricConsumption;
      const electricDistance = Math.min(distance, batteryRange);
      electricConsumption = electricDistance * vehicleEfficiencyData.phev.electricConsumption;
    }
    
    // If using solar, cost is 1/10 of normal instead of zero
    if (hasSolar) {
      return electricConsumption * combinedRate * 0.1;  // 10% of normal cost
    } else {
      return electricConsumption * combinedRate;
    }
  };

  // Compute interest-rate savings by comparing monthly payments at 11% vs 10.85%
  const computeMonthlyPayment = (principal: number, annualRate: number, termMonths: number): number => {
    const monthlyRate = annualRate / 100 / 12;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  };

  // Calculate monthly costs for fuel savings only mode
  const calculateICEMonthlyCost = () => {
    const monthlyLoanPayment = computeMonthlyPayment(iceVehicleValue, 11.46, loanTerm) + 69; // Prime + 0.46% + admin fee
    const monthlyFuelCost = calculateICEMonthlyFuelCost();
    return {
      loanPayment: monthlyLoanPayment,
      fuelCost: monthlyFuelCost,
      total: monthlyLoanPayment + monthlyFuelCost
    };
  };

  const calculateNEVMonthlyCost = () => {
    const monthlyLoanPayment = computeMonthlyPayment(evVehicleValue, 11.0, loanTerm) + 69; // Prime rate + admin fee
    const monthlyEnergyCost = vehicleType === 'ev' ? calculateMonthlyChargingCost() : 
                              vehicleType === 'phev' ? calculateMonthlyChargingCost() + calculateNEVMonthlyFuelCost() :
                              calculateNEVMonthlyFuelCost(); // Hybrid fuel cost
    return {
      loanPayment: monthlyLoanPayment,
      chargingCost: monthlyEnergyCost, // Keep property name for compatibility
      total: monthlyLoanPayment + monthlyEnergyCost
    };
  };
  const payment11 = computeMonthlyPayment(vehicleValue, 11, loanTerm);
  const payment1085 = computeMonthlyPayment(vehicleValue, 10.85, loanTerm);
  const monthlyPaymentSavings = payment11 - payment1085;
  // Discount monthly savings at 14.85% annually
  const annualDiscountRate = 0.1485;
  const monthlyDiscountRate = annualDiscountRate / 12;
  // PV of monthly savings as level annuity
  const interestRateSavings = monthlyPaymentSavings *
    (1 - Math.pow(1 + monthlyDiscountRate, -loanTerm)) /
    monthlyDiscountRate;

  // Build upfront components array
  const upfrontComponents = [];
  
  if (ebucksEnabled) {
    upfrontComponents.push({ label: 'eBucks Benefits', value: hasNoBank ? 0 : calculatePresentValueEbucks(ebucksLevel, {
      useInsurance: hasInsurance,
      useFinancing: hasFinancing,
      useNoBank: hasNoBank
    }) });
  }
  
  upfrontComponents.push({ label: 'Upfront 15Bps Funding Benefit', value: interestRateSavings });
  
  if (showCarbonTax) {
    upfrontComponents.push({ label: 'Carbon Tax Savings', value: results.carbonTaxSavings });
  }
  const displayedUpfrontSavings = upfrontComponents.reduce((sum, comp) => sum + comp.value, 0);

  function calculateCumulativeCost(monthlyBaseCost: number, annualInflation: number, months: number): number {
    let total = 0;
    
    // Calculate cumulative cost by summing monthly costs with inflation applied
    for (let month = 0; month < months; month++) {
      // Apply inflation: original cost * (1 + inflation)^(month/12)
      const inflatedMonthlyCost = monthlyBaseCost * Math.pow(1 + annualInflation, month/12);
      total += inflatedMonthlyCost;
    }
    
    return total;
  }
  
  
  const createFuelComparisonData = () => {
    const monthlyFuelCost     = calculateICEMonthlyFuelCost();
    const monthlyNEVCost      = vehicleType === 'ev' ? calculateMonthlyChargingCost() : 
                                vehicleType === 'phev' ? calculateMonthlyChargingCost() + calculateNEVMonthlyFuelCost() :
                                calculateNEVMonthlyFuelCost(); // Hybrid fuel cost (40% reduction)
    const fuelInflation       = 0.075; // 7.5% annual
    const chargingInflation   = 0.1062; // 10.62% annual for charging costs
  
    const labels            = [];
    const fuelCosts         = [];
    const chargingCosts     = [];
    const cumulativeSavings = [];
  
    // We'll still use this to throttle labels
    const step =
      loanTerm <= 24 ? 2 : loanTerm <= 36 ? 3 : 6;
  
    for (let month = 1; month <= loanTerm; month++) {
      // Only record at step intervals (or first/last)
      if (month % step !== 0 && month !== 1 && month !== loanTerm) {
        continue;
      }
  
      // Calculate cumulative costs as nominal values (no discounting)
      const cumFuel = calculateCumulativeCost(
        monthlyFuelCost,
        fuelInflation,
        month
      );
      
      const cumNEV = calculateCumulativeCost(
        monthlyNEVCost,
        vehicleType === 'ev' || vehicleType === 'phev' ? chargingInflation : fuelInflation,
        month
      );
  
      labels.push(`Month ${month}`);
      fuelCosts.push(Number(cumFuel.toFixed(2)));
      chargingCosts.push(Number(cumNEV.toFixed(2)));
      cumulativeSavings.push(Number((cumFuel - cumNEV).toFixed(2)));
    }
  
    return {
      labels,
      fuelCosts,
      chargingCosts,
      cumulativeSavings,
    };
  };
  
  const fuelComparisonData = createFuelComparisonData();
  
  // Calculate raw (undiscounted) fuel spend savings over term
  const rawFuelSpendSavings = fuelComparisonData.cumulativeSavings.length > 0 
    ? fuelComparisonData.cumulativeSavings[fuelComparisonData.cumulativeSavings.length - 1] 
    : 0;
  
  // Bar chart data for savings breakdown (raw term savings)
  const barChartData = {
    labels: ['Installment Savings', 'Loan Term Fuel Savings'],
    datasets: [
      {
        label: '',
        data: [(() => {
          // Calculate Term Finance Savings
          const originalPayment = Math.round(computeMonthlyPayment(vehicleValue + 1213, 11.46, loanTerm) + 69);
          
          // Dynamic calculation for benefits scenario
          let upfrontSavings = interestRateSavings;
          if (ebucksEnabled && !hasNoBank) {
            upfrontSavings += calculatePresentValueEbucks(ebucksLevel, {
              useInsurance: hasInsurance,
              useFinancing: hasFinancing,
              useNoBank: hasNoBank
            });
          }
          
          // Principal amount is vehicle value minus upfront savings
          const principalAmount = vehicleValue - upfrontSavings;
          const monthlyRate = 10.8 / 100 / 12;
          const basePayment = (principalAmount * monthlyRate) / 
            (1 - Math.pow(1 + monthlyRate, -loanTerm));
          const benefitsPayment = Math.round(basePayment + 69);
          
          // Calculate total term finance savings over loan term
          return (originalPayment - benefitsPayment) * loanTerm;
        })(), rawFuelSpendSavings],
        backgroundColor: [
          'rgba(0, 166, 182, 0.8)',
          'rgba(248, 156, 51, 0.8)'
        ],
        borderColor: [
          'rgba(0, 166, 182, 1)',
          'rgba(248, 156, 51, 1)'
        ],
        borderWidth: 1
      }
    ]
  };

  // Calculate percentages for pie chart
  const ebucksValue = (ebucksEnabled && !hasNoBank) ? calculatePresentValueEbucks(ebucksLevel, {
    useInsurance: hasInsurance,
    useFinancing: hasFinancing,
    useNoBank: hasNoBank
  }) : 0;
  const totalUpfrontSavings = ebucksValue + interestRateSavings + (showCarbonTax ? results.carbonTaxSavings : 0);
  const ebucksPercentage = totalUpfrontSavings > 0 ? Math.round((ebucksValue / totalUpfrontSavings) * 100) : 0;
  const carbonPercentage = totalUpfrontSavings > 0 && showCarbonTax ? Math.round((results.carbonTaxSavings / totalUpfrontSavings) * 100) : 0;

  // Pie chart data for upfront savings breakdown (conditional eBucks and Carbon Tax)
  let pieChartLabels = [];
  let pieChartValues = [];
  let pieBgColors = [];
  let pieBorderColors = [];
  
  if (ebucksEnabled && ebucksValue > 0) {
    pieChartLabels.push('eBucks Benefits');
    pieChartValues.push(ebucksValue);
    pieBgColors.push('rgba(0, 166, 182, 0.8)');
    pieBorderColors.push('rgba(0, 166, 182, 1)');
  }
  
  pieChartLabels.push('Upfront 15Bps Funding Benefit');
  pieChartValues.push(interestRateSavings);
  pieBgColors.push('rgba(255, 193, 7, 0.8)');
  pieBorderColors.push('rgba(255, 193, 7, 1)');
  
  if (showCarbonTax) {
    pieChartLabels.push('Carbon Tax Savings');
    pieChartValues.push(results.carbonTaxSavings);
    pieBgColors.push('rgba(76, 175, 80, 0.8)');
    pieBorderColors.push('rgba(76, 175, 80, 1)');
  }
  const pieChartData = {
    labels: pieChartLabels,
    datasets: [
      {
        data: pieChartValues,
        backgroundColor: pieBgColors,
        borderColor: pieBorderColors,
        borderWidth: 1
      }
    ]
  };

  // CO2 Emissions Comparison Chart
  const co2EmissionsChartData = {
    labels: ['ICE Vehicle', 'Electric Vehicle'],
    datasets: [
      {
        label: 'Monthly CO₂ Emissions (kg)',
        data: [results.co2Emissions.ice, results.co2Emissions.ev],
        backgroundColor: [
          'rgba(248, 156, 51, 0.8)',
          'rgba(0, 166, 182, 0.8)',
        ],
        borderColor: [
          'rgba(248, 156, 51, 1)',
          'rgba(0, 166, 182, 1)',
        ],
        borderWidth: 1,
      }
    ]
  };

  // Number of years for the loan term (rounded up)
  const loanTermYears = Math.ceil(loanTerm / 12);
  
  // Line chart for projected annual savings
  const annualSavingsData = {
    labels: Array.from({ length: loanTermYears }, (_, i) => `Year ${i + 1}`),
    datasets: [
      {
        label: 'Projected Annual Savings',
        data: (() => {
          // Calculate the annual distribution of the total savings
          const yearlyBaseSavings = results.totalSavings / loanTermYears;
          return Array.from({ length: loanTermYears }, (_, i) => 
            Math.round(yearlyBaseSavings * (1 + 0.1 * i)) // Add 10% growth each year
          );
        })(),
        borderColor: 'rgba(0, 166, 182, 1)',
        backgroundColor: 'rgba(0, 166, 182, 0.2)',
        tension: 0.4,
        fill: true
      }
    ]
  };

  // Fuel comparison chart data
  const fuelComparisonChartData = {
    labels: fuelComparisonData.labels,
    datasets: [
      {
        label: 'Fuel Costs (ICE Vehicle)',
        data: fuelComparisonData.fuelCosts,
        borderColor: 'rgba(248, 156, 51, 1)',
        backgroundColor: 'rgba(248, 156, 51, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true
      },
      {
        label: vehicleType === 'ev' ? 'Charging Costs (EV)' : 
               vehicleType === 'phev' ? 'Charging Costs (PHEV)' : 
               'Fuel Costs (Hybrid)',
        data: fuelComparisonData.chargingCosts,
        borderColor: 'rgba(0, 166, 182, 1)',
        backgroundColor: 'rgba(0, 166, 182, 0.1)',
        borderWidth: 2,
        tension: 0.4,
        fill: true
      },
      {
        label: 'Cumulative Savings',
        data: fuelComparisonData.cumulativeSavings,
        borderColor: 'rgba(76, 175, 80, 1)',
        backgroundColor: 'rgba(76, 175, 80, 0.0)',
        borderWidth: 3,
        borderDash: [5, 5],
        tension: 0.4,
        fill: false
      }
    ]
  };

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return 'R ' + context.raw.toLocaleString();
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return 'R ' + value.toLocaleString();
          }
        }
      }
    }
  };

  // Pie chart options with percentages
  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.raw || 0;
            const percentage = totalUpfrontSavings > 0 
              ? Math.round((value / totalUpfrontSavings) * 100) 
              : 0;
            return `${label}: R${value.toLocaleString()} (${percentage}%)`;
          }
        }
      }
    },
    elements: {
      arc: {
        borderWidth: 0 // Remove border lines
      }
    }
  };

  // Extended chart options for fuel comparison chart
  const fuelComparisonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return 'R ' + context.raw.toLocaleString();
          }
        }
      },
      title: {
        display: true,
        text: `Fuel vs Charging Costs Over ${loanTerm} Months`,
        font: {
          size: 16
        }
      },
      datalabels: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Cumulative Cost (ZAR)'
        },
        ticks: {
          callback: function(value: any) {
            return 'R ' + value.toLocaleString();
          }
        }
      },
      y1: {
        position: 'right' as const,
        beginAtZero: true,
        title: {
          display: true,
          text: 'Cumulative Savings (ZAR)'
        },
        grid: {
          drawOnChartArea: false
        },
        ticks: {
          callback: function(value: any) {
            return 'R ' + value.toLocaleString();
          }
        }
      }
    }
  };

  // Calculate standard 5-year upfront benefits
  const calculateStandardUpfrontBenefits = () => {
    // Use level 4 with insurance and financing for standard calculation
    const standardEbucksValue = calculatePresentValueEbucks(4, {
      useInsurance: true,
      useFinancing: true,
      useNoBank: false
    });
    
    return {
      presentValueEbucks: standardEbucksValue,
      carbonTaxSavings: results.carbonTaxSavings,
      upfrontSavings: standardEbucksValue + results.carbonTaxSavings
    };
  };

  // Get standard 5-year upfront benefits
  const standard5YearUpfront = calculateStandardUpfrontBenefits();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="h-12">
            <h1 className="text-2xl font-bold text-[#00a6b6]">EV Calculator</h1>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-[#00a6b6]">
              Fuel Savings Only
            </span>
            {/* Toggle hidden for now - keeping code for future use */}
            {/* <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only"
                checked={ebucksEnabled}
                onChange={(e) => setEbucksEnabled(e.target.checked)}
              />
              <div className={`w-11 h-6 rounded-full shadow-inner transition-colors duration-200 ${
                ebucksEnabled ? 'bg-[#00a6b6]' : 'bg-gray-300'
              }`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ${
                  ebucksEnabled ? 'translate-x-6' : 'translate-x-1'
                } mt-1`}></div>
              </div>
            </label>
            <span className={`text-sm font-medium ${ebucksEnabled ? 'text-[#00a6b6]' : 'text-gray-500'}`}>
              Include eBucks Benefits
            </span> */}
          </div>
        </div>
      </header>

      {/* Navigation hidden for now - keeping code for future use */}
      {/* <nav className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4">
          <ul className="flex space-x-8">
            <li>
              <a 
                href="#" 
                className={`inline-block py-4 ${activeTab === 'calculate' ? 'text-[#00a6b6] border-b-2 border-[#00a6b6]' : 'text-gray-500'}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab('calculate');
                }}
              >
                Calculate
              </a>
            </li>
            <li>
              <a 
                href="#" 
                className={`inline-block py-4 ${activeTab === 'visuals' ? 'text-[#00a6b6] border-b-2 border-[#00a6b6]' : 'text-gray-500'}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab('visuals');
                }}
              >
                Visuals
              </a>
            </li>
          </ul>
        </div>
      </nav> */}

      <main className="container mx-auto px-4 py-8 overflow-x-hidden">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-[#00a6b6] mb-4">EV Savings Calculator</h1>
          <p className="text-gray-600">Calculate the incredible savings and environmental benefits of switching to an electric vehicle!</p>
        </div>

        {isOfflineMode && (
          <div className="bg-blue-50 text-blue-700 p-4 mb-6 rounded-md">
            <p className="font-medium">Operating in offline mode</p>
            <p className="text-sm">Calculations are being performed locally as the server connection is unavailable.</p>
          </div>
        )}

        {activeTab === 'calculate' && (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-6">Enter Your Information:</h2>
              
              <div className="space-y-6">
                {/* Vehicle Type Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Vehicle Type</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'hybrid', label: 'Hybrid', icon: '🔋', description: '40% Less Fuel' },
                      { id: 'phev', label: 'PHEV', icon: '🔌', description: 'Plug-in Hybrid' },
                      { id: 'ev', label: 'EV', icon: '⚡', description: 'Electric Only' }
                    ].map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setVehicleType(type.id as 'hybrid' | 'phev' | 'ev')}
                        className={`p-3 rounded-lg border-2 transition-all duration-200 ${
                          vehicleType === type.id 
                            ? 'border-[#00a6b6] bg-[#00a6b6] text-white shadow-md' 
                            : 'border-gray-300 bg-white hover:border-[#00a6b6] hover:bg-gray-50'
                        }`}
                      >
                        <div className="text-xl mb-1">{type.icon}</div>
                        <div className="font-medium text-sm">{type.label}</div>
                        <div className="text-xs opacity-80">{type.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* PHEV Specific Inputs */}
                {vehicleType === 'phev' && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h3 className="text-sm font-medium text-blue-800 mb-3">PHEV Configuration</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Battery Capacity (kWh)</label>
                        <input
                          type="number"
                          min="8"
                          max="30"
                          step="0.1"
                          value={phevBatteryCapacity}
                          onChange={(e) => setPhevBatteryCapacity(Number(e.target.value))}
                          className="w-full border-2 border-gray-300 focus:border-[#00a6b6] rounded-md py-2 px-3 font-medium text-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00a6b6] focus:ring-opacity-30"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Fuel Tank Size (L)</label>
                        <input
                          type="number"
                          min="30"
                          max="80"
                          step="1"
                          value={phevFuelTankSize}
                          onChange={(e) => setPhevFuelTankSize(Number(e.target.value))}
                          className="w-full border-2 border-gray-300 focus:border-[#00a6b6] rounded-md py-2 px-3 font-medium text-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00a6b6] focus:ring-opacity-30"
                        />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-blue-600">
                      <div>Estimated Range: {Math.round(phevBatteryCapacity / vehicleEfficiencyData.phev.electricConsumption)}km electric + {Math.round(phevFuelTankSize / vehicleEfficiencyData.ice.fuelConsumption[fuelType as keyof typeof vehicleEfficiencyData.ice.fuelConsumption] * 100)}km fuel</div>
                      <div>NEV Fuel Consumption: {getNEVFuelConsumption().toFixed(1)} L/100km</div>
                      <div>ICE Fuel Consumption: {getICEFuelConsumption().toFixed(1)} L/100km</div>
                    </div>
                  </div>
                )}

                {ebucksEnabled ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Value (ZAR)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#00a6b6] font-semibold">R</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={vehicleValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Only update if empty or contains only digits
                          if (value === '' || /^\d+$/.test(value)) {
                            setVehicleValue(value === '' ? 0 : Number(value));
                          }
                        }}
                        className="w-full border-2 border-gray-300 focus:border-[#00a6b6] rounded-md py-3 pl-8 pr-3 font-medium text-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00a6b6] focus:ring-opacity-30"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">ICE Vehicle Value (ZAR)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#00a6b6] font-semibold">R</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={iceVehicleValue}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Only update if empty or contains only digits
                            if (value === '' || /^\d+$/.test(value)) {
                              setIceVehicleValue(value === '' ? 0 : Number(value));
                            }
                          }}
                          className="w-full border-2 border-gray-300 focus:border-[#00a6b6] rounded-md py-3 pl-8 pr-3 font-medium text-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00a6b6] focus:ring-opacity-30"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">EV Vehicle Value (ZAR)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#00a6b6] font-semibold">R</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={evVehicleValue}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Only update if empty or contains only digits
                            if (value === '' || /^\d+$/.test(value)) {
                              setEvVehicleValue(value === '' ? 0 : Number(value));
                            }
                          }}
                          className="w-full border-2 border-gray-300 focus:border-[#00a6b6] rounded-md py-3 pl-8 pr-3 font-medium text-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00a6b6] focus:ring-opacity-30"
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Monthly Distance (km)</label>
                  <input
                    type="range"
                    min="100"
                    max="5000"
                    value={distance}
                    onChange={(e) => setDistance(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="text-right text-sm text-gray-600 mt-1">{distance} km</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Fuel Type</label>
                  <div className="relative">
                    <select
                      value={fuelType}
                      onChange={(e) => setFuelType(e.target.value)}
                      className="w-full appearance-none border-2 border-gray-300 focus:border-[#00a6b6] rounded-md py-3 px-3 font-medium text-gray-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00a6b6] focus:ring-opacity-30"
                    >
                      <option value="petrol95">Petrol 95</option>
                      <option value="petrol93">Petrol 93</option>
                      <option value="diesel">Diesel</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#00a6b6]">
                      <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    ICE Consumption: {getICEFuelConsumption().toFixed(1)} L/100km
                    {vehicleType !== 'ev' && (
                      <span> | NEV Consumption: {getNEVFuelConsumption().toFixed(1)} L/100km</span>
                    )}
                  </div>
                </div>

                {ebucksEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">eBucks Level</label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={ebucksLevel}
                      onChange={(e) => setEbucksLevel(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="text-right text-sm text-gray-600 mt-1">Level {ebucksLevel}</div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Loan Term (months)</label>
                  <input
                    type="range"
                    min="12"
                    max="84"
                    step="12"
                    value={loanTerm}
                    onChange={(e) => setLoanTerm(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="text-right text-sm text-gray-600 mt-1">
                    {loanTerm} months ({Math.round(loanTerm/12 * 10) / 10} years)
                  </div>
                </div>

                <div className="space-y-3">
                  {ebucksEnabled && (
                    <>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="insurance"
                          checked={hasInsurance}
                          onChange={(e) => setHasInsurance(e.target.checked)}
                          className="h-5 w-5 text-[#00a6b6] rounded-md border-2 border-gray-300 focus:ring-[#00a6b6] focus:ring-offset-0 transition-all duration-200 cursor-pointer"
                          disabled={hasNoBank}
                        />
                        <label htmlFor="insurance" className={`ml-2 text-sm ${hasNoBank ? 'text-gray-400' : 'text-gray-700'}`}>
                          FNB Car Insurance
                          <span className="relative inline-block ml-1 group">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 hover:text-[#00a6b6] transition-colors" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <span className="absolute left-0 bottom-full mb-2 w-64 bg-gray-800 text-white text-xs rounded py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 shadow-lg">
                              Is your current vehicle insured by FNB car insurance or are you intending to insure the new vehicle with FNB?
                              <span className="absolute left-0 top-full w-3 h-3 -mt-1 ml-3 transform rotate-45 bg-gray-800"></span>
                            </span>
                          </span>
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="financing"
                          checked={hasFinancing}
                          onChange={(e) => setHasFinancing(e.target.checked)}
                          className="h-5 w-5 text-[#00a6b6] rounded-md border-2 border-gray-300 focus:ring-[#00a6b6] focus:ring-offset-0 transition-all duration-200 cursor-pointer"
                          disabled={hasNoBank}
                        />
                        <label htmlFor="financing" className={`ml-2 text-sm ${hasNoBank ? 'text-gray-400' : 'text-gray-700'}`}>
                          WesBank Vehicle Finance
                          <span className="relative inline-block ml-1 group">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 hover:text-[#00a6b6] transition-colors" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <span className="absolute left-0 bottom-full mb-2 w-64 bg-gray-800 text-white text-xs rounded py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 shadow-lg">
                              Is your current vehicle financed through WesBank car finance and are you intending to finance the EV through WesBank car finance?
                              <span className="absolute left-0 top-full w-3 h-3 -mt-1 ml-3 transform rotate-45 bg-gray-800"></span>
                            </span>
                          </span>
                        </label>
                      </div>
                    </>
                  )}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="solar"
                      checked={hasSolar}
                      onChange={(e) => setHasSolar(e.target.checked)}
                      className="h-5 w-5 text-[#00a6b6] rounded-md border-2 border-gray-300 focus:ring-[#00a6b6] focus:ring-offset-0 transition-all duration-200 cursor-pointer"
                    />
                    <label htmlFor="solar" className="ml-2 text-sm text-gray-700">
                      Charge EV using Home solar
                      <span className="relative inline-block ml-1 group">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 hover:text-[#00a6b6] transition-colors" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <span className="absolute left-0 bottom-full mb-2 w-64 bg-gray-800 text-white text-xs rounded py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 shadow-lg">
                          Do you have solar at your household and do you intend to utilise this solar to charge your EV? (10% of full charging costs)
                          <span className="absolute left-0 top-full w-3 h-3 -mt-1 ml-3 transform rotate-45 bg-gray-800"></span>
                        </span>
                      </span>
                    </label>
                  </div>
                  {ebucksEnabled && (
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="nobank"
                        checked={hasNoBank}
                        onChange={(e) => setHasNoBank(e.target.checked)}
                        className="h-5 w-5 text-[#00a6b6] rounded-md border-2 border-gray-300 focus:ring-[#00a6b6] focus:ring-offset-0 transition-all duration-200 cursor-pointer"
                      />
                      <label htmlFor="nobank" className="ml-2 text-sm text-gray-700">
                        Do not bank with FNB or RMB
                        <span className="relative inline-block ml-1 group">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 hover:text-[#00a6b6] transition-colors" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <span className="absolute left-0 bottom-full mb-2 w-72 bg-gray-800 text-white text-xs rounded py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 shadow-lg">
                            The upfront benefit only applies to clients who bank with FNB/RMB and intend to finance or insure their vehicle with WesBank or FNB respectively.
                            <span className="absolute left-0 top-full w-3 h-3 -mt-1 ml-3 transform rotate-45 bg-gray-800"></span>
                          </span>
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleCalculate}
                  disabled={isCalculating}
                  className="w-full bg-[#00a6b6] text-white py-3 rounded-md hover:bg-[#008a97] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCalculating ? 'CALCULATING...' : 'CALCULATE SAVINGS'}
                </button>
              </div>
              
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">
                  ICE vs {vehicleType.toUpperCase()} Cost Comparison Over Loan Term
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <div className="h-64">
                    <Line 
                      data={fuelComparisonChartData} 
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            display: false
                          },
                          tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.9)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            cornerRadius: 6,
                            callbacks: {
                              label: function(context: any) {
                                return context.dataset.label + ': R' + context.raw.toLocaleString();
                              }
                            }
                          },
                          title: {
                            display: false
                          }
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            title: {
                              display: true,
                              text: 'Cumulative Cost (R)',
                              font: {
                                size: 11,
                                weight: 'bold'
                              },
                              color: '#374151'
                            },
                            ticks: {
                              callback: function(value: any) {
                                return 'R' + (value/1000).toFixed(0) + 'k';
                              },
                              font: {
                                size: 10
                              },
                              maxTicksLimit: 10
                            },
                            grid: {
                              color: 'rgba(226, 232, 240, 0.8)',
                              lineWidth: 1
                            }
                          },
                          x: {
                            title: {
                              display: false
                            },
                            ticks: {
                              font: {
                                size: 10
                              },
                              maxTicksLimit: 8
                            },
                            grid: {
                              color: 'rgba(226, 232, 240, 0.4)',
                              lineWidth: 1
                            }
                          }
                        },
                        elements: {
                          line: {
                            tension: 0.3,
                            borderWidth: 2
                          },
                          point: {
                            radius: 0,
                            hoverRadius: 4
                          }
                        }
                      }} 
                    />
                  </div>
                  <div className="mt-3 flex justify-center space-x-6 text-xs">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-[#f89c33] rounded-full mr-2"></div>
                      <span>ICE Vehicle</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-[#00a6b6] rounded-full mr-2"></div>
                      <span>{vehicleType.toUpperCase()} Vehicle</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-[#4CAF50] rounded-full mr-2"></div>
                      <span>Savings</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">Cumulative Trees Planted Equivalent</h3>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h3 className="text-lg font-medium mb-4">Environmental Impact Over Time</h3>
                  <div className="h-64">
                    <Line 
                      data={{
                        labels: Array.from({ length: Math.ceil(loanTerm / 12) }, (_, i) => `Year ${i + 1}`),
                        datasets: [
                          {
                            label: 'Trees Planted Equivalent',
                            data: Array.from({ length: Math.ceil(loanTerm / 12) }, (_, i) => 
                              Math.round(results.co2Emissions.yearlySavings * (i + 1) / 22)
                            ),
                            borderColor: 'rgba(34, 197, 94, 1)',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            tension: 0.4,
                            fill: true,
                            borderWidth: 3,
                            pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                            pointBorderColor: 'rgba(255, 255, 255, 1)',
                            pointBorderWidth: 2,
                            pointRadius: 6,
                            pointHoverRadius: 8
                          }
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            display: false
                          },
                          tooltip: {
                            callbacks: {
                              label: function(context: any) {
                                return `${context.raw.toLocaleString()} trees planted equivalent`;
                              }
                            }
                          }
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            title: {
                              display: true,
                              text: 'Trees Planted Equivalent',
                              font: {
                                size: 12,
                                weight: 'bold'
                              },
                              color: '#374151'
                            },
                            ticks: {
                              callback: function(value: any) {
                                return value.toLocaleString() + ' trees';
                              }
                            },
                            grid: {
                              color: 'rgba(226, 232, 240, 0.5)'
                            }
                          },
                          x: {
                            title: {
                              display: true,
                              text: 'Years',
                              font: {
                                size: 12,
                                weight: 'bold'
                              },
                              color: '#374151'
                            },
                            grid: {
                              color: 'rgba(226, 232, 240, 0.5)'
                            }
                          }
                        }
                      }}
                    />
                  </div>
                </div>
                
                <div className="bg-gray-50 p-6 rounded-lg mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <h3 className="text-lg font-medium mb-2">Total CO₂ Savings</h3>
                      <div className="text-3xl font-bold text-[#4CAF50]">
                        {Math.round(results.co2Emissions.yearlySavings * Math.ceil(loanTerm / 12)).toLocaleString()} kg
                      </div>
                      <div className="text-sm text-gray-600">Over {Math.ceil(loanTerm / 12)} year{Math.ceil(loanTerm / 12) > 1 ? 's' : ''}</div>
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-medium mb-2">Environmental Equivalent</h3>
                      <div className="text-3xl font-bold text-[#228B22]">
                        {Math.round(results.co2Emissions.yearlySavings * Math.ceil(loanTerm / 12) / 22).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Trees planted equivalent</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-3 gap-4 text-center text-sm">
                      <div>
                        <div className="font-medium text-gray-700">Monthly Savings</div>
                        <div className="text-lg font-bold text-[#4CAF50]">
                          {results.co2Emissions.monthlySavings.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-700">Yearly Savings</div>
                        <div className="text-lg font-bold text-[#4CAF50]">
                          {results.co2Emissions.yearlySavings.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-700">Grid Efficiency</div>
                        <div className="text-lg font-bold text-[#00a6b6]">
                          {hasSolar ? '90% Cleaner' : '80% Cleaner'}
                        </div>
                        <div className="text-xs text-gray-500">vs ICE vehicle</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-6">{ebucksEnabled ? 'EV Savings Breakdown:' : 'Monthly Cost Breakdown:'}</h2>
              
              {ebucksEnabled ? (
                <div className="bg-[#00a6b6] text-white p-6 rounded-lg mb-6">
                  <div className="flex flex-col lg:flex-row lg:justify-between">
                    <div className="flex-1 mb-4 lg:mb-0">
                      <h3 className="text-lg font-medium mb-2">Total Estimated Savings</h3>
                      <div className="text-3xl font-bold mb-1">
                        {(() => {
                          // Calculate Term Finance Savings
                          const originalPayment = Math.round(computeMonthlyPayment(vehicleValue + 1213, 11.46, loanTerm) + 69);
                          
                          // Dynamic calculation for benefits scenario
                          let upfrontSavings = interestRateSavings;
                          if (ebucksEnabled && !hasNoBank) {
                            upfrontSavings += calculatePresentValueEbucks(ebucksLevel, {
                              useInsurance: hasInsurance,
                              useFinancing: hasFinancing,
                              useNoBank: hasNoBank
                            });
                          }
                          
                          // Principal amount is vehicle value minus upfront savings
                          const principalAmount = vehicleValue - upfrontSavings +1213;
                          const monthlyRate = 11.46 / 100 / 12;
                          const basePayment = (principalAmount * monthlyRate) / 
                            (1 - Math.pow(1 + monthlyRate, -loanTerm));
                          const benefitsPayment = Math.round(basePayment + 69);
                          
                          // Calculate total term finance savings over loan term
                          const termFinanceSavings = (originalPayment - benefitsPayment) * loanTerm;
                          
                          // Fuel savings over term (rawFuelSpendSavings)
                          
                          // Total savings is term finance savings + fuel savings
                          const totalSavings = termFinanceSavings + rawFuelSpendSavings;
                          
                          return `R${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        })()}
                      </div>
                      <div className="text-sm opacity-80">over {Math.round(loanTerm/12 * 10) / 10} years</div>
                      <div className="mt-2">
                        <div className="text-xs opacity-80">Monthly Savings</div>
                        <div className="text-lg font-bold">
                          {(() => {
                            // Calculate monthly savings
                            const originalPayment = Math.round(computeMonthlyPayment(vehicleValue + 1213, 11.46, loanTerm) + 69);
                            
                            let upfrontSavings = interestRateSavings;
                            if (ebucksEnabled && !hasNoBank) {
                              upfrontSavings += calculatePresentValueEbucks(ebucksLevel, {
                                useInsurance: hasInsurance,
                                useFinancing: hasFinancing,
                                useNoBank: hasNoBank
                              });
                            }
                            
                            const principalAmount = vehicleValue - upfrontSavings + 1213;
                            const monthlyRate = 11.46 / 100 / 12;
                            const basePayment = (principalAmount * monthlyRate) / 
                              (1 - Math.pow(1 + monthlyRate, -loanTerm));
                            const benefitsPayment = Math.round(basePayment + 69);
                            
                            const termFinanceSavings = (originalPayment - benefitsPayment) * loanTerm;
                            const totalSavings = termFinanceSavings + rawFuelSpendSavings;
                            const monthlySavings = totalSavings / loanTerm;
                            
                            return `R${monthlySavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 lg:pl-6 lg:border-l border-cyan-400 pt-4 lg:pt-0 border-t lg:border-t-0 border-cyan-400">
                      <h4 className="text-sm font-semibold mb-2">Monthly Installment Impact</h4>
                      
                      {/* Original scenario */}
                      <div className="mb-3">
                        <div className="text-xs opacity-80">Original (Prime+0.46%, R69 fee)</div>
                        <div className="text-lg font-bold">
                          R{Math.round(computeMonthlyPayment(vehicleValue + 1213, 11.46, loanTerm) + 69).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      
                      {/* With benefits scenario - use full upfront savings as deposit */}
                      <div className="mb-2">
                        <div className="text-xs opacity-80">With Benefits (Prime+0.46, R69 fee)</div>
                        <div className="text-lg font-bold text-green-300">
                          {(() => {
                            // Dynamic calculation that changes with eBucks level
                            let upfrontSavings = interestRateSavings;
                            if (ebucksEnabled && !hasNoBank) {
                              upfrontSavings += calculatePresentValueEbucks(ebucksLevel, {
                                useInsurance: hasInsurance,
                                useFinancing: hasFinancing,
                                useNoBank: hasNoBank
                              });
                            }
                            
                            // Principal amount is vehicle value minus upfront savings
                            const principalAmount = vehicleValue - upfrontSavings+1213;
                            const monthlyRate = 11.46 / 100 / 12;
                            const basePayment = (principalAmount * monthlyRate) / 
                              (1 - Math.pow(1 + monthlyRate, -loanTerm));
                            const totalPayment = Math.round(basePayment + 69);
                            
                            return `R${totalPayment.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                          })()}
                        </div>
                      </div>
                      
                      {/* Savings breakdown */}
                      <div className="mt-2 pt-2 border-t border-cyan-400">
                        <div className="flex justify-between text-xs">
                          <span>Term Finance Savings:</span>
                          <span className="font-medium">
                            {(() => {
                              // Original calculation with R1213 added
                              const originalPayment = Math.round(computeMonthlyPayment(vehicleValue + 1213, 11.46, loanTerm) + 69);
                              
                              // Dynamic calculation that changes with eBucks level
                              const upfrontSavings = hasNoBank ? 0 : calculatePresentValueEbucks(ebucksLevel, {
                                useInsurance: hasInsurance,
                                useFinancing: hasFinancing,
                                useNoBank: hasNoBank
                              }) + interestRateSavings;
                              
                              // Principal amount is vehicle value minus upfront savings
                              const principalAmount = vehicleValue - upfrontSavings + 1213;
                              const monthlyRate = 11.46 / 100 / 12;
                              const basePayment = (principalAmount * monthlyRate ) / 
                                (1 - Math.pow(1 + monthlyRate, -loanTerm));
                              const benefitsPayment = Math.round(basePayment + 69);
                              
                              // Calculate total savings over term
                              const totalSavings = (originalPayment - benefitsPayment) * loanTerm;
                              
                              return `R${totalSavings.toLocaleString()}`;
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs mt-1">
                          <span>+ Fuel Savings:</span>
                          <span className="font-medium">R{rawFuelSpendSavings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                {/* Total Estimated Savings for Fuel Savings Only */}
                <div className="bg-[#00a6b6] text-white p-6 rounded-lg mb-6">
                  <div className="flex flex-col lg:flex-row lg:justify-between">
                    <div className="flex-1 mb-4 lg:mb-0">
                      <h3 className="text-lg font-medium mb-2">Total Estimated Savings</h3>
                      <div className="text-3xl font-bold mb-1">
                        {(() => {
                          const termFinanceSavings = (calculateICEMonthlyCost().loanPayment - calculateNEVMonthlyCost().loanPayment) * loanTerm;
                          const totalSavings = termFinanceSavings + rawFuelSpendSavings;
                          return `R${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        })()}
                      </div>
                      <div className="text-sm opacity-80">over {Math.round(loanTerm/12 * 10) / 10} years</div>
                      <div className="mt-2">
                        <div className="text-xs opacity-80">Monthly Savings (Including fuel and electricity inflation)</div>
                        <div className="text-lg font-bold">
                          {(() => {
                            const termFinanceSavings = (calculateICEMonthlyCost().loanPayment - calculateNEVMonthlyCost().loanPayment) * loanTerm;
                            const totalSavings = termFinanceSavings + rawFuelSpendSavings;
                            const monthlySavings = totalSavings / loanTerm;
                            return `R${monthlySavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 lg:pl-6 lg:border-l border-cyan-400 pt-4 lg:pt-0 border-t lg:border-t-0 border-cyan-400">
                      <h4 className="text-sm font-semibold mb-2">Monthly Installment Impact</h4>
                      
                      {/* Original scenario */}
                      <div className="mb-3">
                        <div className="text-xs opacity-80">ICE Vehicle (Prime+0.46%, R69 fee)</div>
                        <div className="text-lg font-bold">
                          R{calculateICEMonthlyCost().loanPayment.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      
                      {/* With benefits scenario */}
                      <div className="mb-2">
                        <div className="text-xs opacity-80">{vehicleType.toUpperCase()} Vehicle (Prime, R69 fee)</div>
                        <div className="text-lg font-bold text-green-300">
                          R{calculateNEVMonthlyCost().loanPayment.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                      
                      {/* Savings breakdown */}
                      <div className="mt-2 pt-2 border-t border-cyan-400">
                        <div className="flex justify-between text-xs">
                          <span>Term Finance Savings:</span>
                          <span className="font-medium">
                            R{((calculateICEMonthlyCost().loanPayment - calculateNEVMonthlyCost().loanPayment) * loanTerm).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs mt-1">
                          <span>+ Fuel Savings:</span>
                          <span className="font-medium">R{rawFuelSpendSavings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Combined ICE vs EV Comparison */}
                <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* ICE Vehicle Costs */}
                    <div className="bg-teal-50 p-4 rounded-lg border border-teal-200">
                      <h3 className="text-lg font-semibold mb-4 text-[#00a6b6]">ICE Vehicle Costs</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Monthly Loan Payment</span>
                          <span className="font-medium">R{calculateICEMonthlyCost().loanPayment.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Monthly Fuel Expenses</span>
                          <span className="font-medium">R{calculateICEMonthlyCost().fuelCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="border-t border-teal-200 pt-2">
                          <div className="flex justify-between">
                            <span className="font-semibold text-[#00a6b6]">ICE Monthly Cost</span>
                            <span className="font-bold text-xl text-[#00a6b6]">R{calculateICEMonthlyCost().total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* NEV Vehicle Costs */}
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h3 className="text-lg font-semibold mb-4 text-green-700">{vehicleType.toUpperCase()} Vehicle Costs</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Monthly Loan Payment</span>
                          <span className="font-medium">R{calculateNEVMonthlyCost().loanPayment.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">
                            {vehicleType === 'ev' ? 'Monthly Electricity Costs' : 
                             vehicleType === 'phev' ? 'Monthly Energy Costs' : 
                             'Monthly Fuel Costs'}
                          </span>
                          <span className="font-medium">R{calculateNEVMonthlyCost().chargingCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="border-t border-green-200 pt-2">
                          <div className="flex justify-between">
                            <span className="font-semibold text-green-700">{vehicleType.toUpperCase()} Monthly Cost</span>
                            <span className="font-bold text-xl text-green-700">R{calculateNEVMonthlyCost().total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Monthly Savings Summary */}
                <div className="bg-[#00a6b6] text-white p-6 rounded-lg mb-6">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">Current Monthly Savings with {vehicleType.toUpperCase()} vs ICE</h3>
                    <div className="text-4xl font-bold mb-2">
                      R{(calculateICEMonthlyCost().total - calculateNEVMonthlyCost().total).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-sm opacity-80">
                      Total over {Math.round(loanTerm/12 * 10) / 10} years (With no inflation): R{((calculateICEMonthlyCost().total - calculateNEVMonthlyCost().total) * loanTerm).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
                </>
              )}

              {ebucksEnabled && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded-lg col-span-2 md:col-span-1">
                    <h3 className="text-lg font-medium mb-2">Upfront Savings</h3>
                    <div className="text-2xl font-bold text-[#00a6b6] mb-1">R{displayedUpfrontSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-sm space-y-2">
                      {upfrontComponents.map((comp) => (
                        <div key={comp.label} className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-600">{comp.label}:</span>
                            <span className="font-medium">R{comp.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {ebucksEnabled && hasNoBank && (
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <h4 className="text-sm font-medium mb-1">FirstRand Banking benefit (level 4)</h4>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-600">eBucks Benefits:</span>
                            <span className="font-medium">R{standard5YearUpfront.presentValueEbucks.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Upfront:</span>
                            <span className="font-medium">R{standard5YearUpfront.upfrontSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg col-span-2 md:col-span-1">
                    <h3 className="text-lg font-medium mb-2">Loan Term Fuel Savings</h3>
                    <div className="text-2xl font-bold text-[#00a6b6] mb-4">R{rawFuelSpendSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Fuel Spend:</span>
                        <span className="font-medium">R{fuelComparisonData.fuelCosts[fuelComparisonData.fuelCosts.length-1].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Charge Spend:</span>
                        <span className="font-medium text-green-600">R{fuelComparisonData.chargingCosts[fuelComparisonData.chargingCosts.length-1].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}



              <button className="w-full bg-[#00a6b6] text-white py-3 rounded-md hover:bg-[#008a97] transition-colors">
                APPLY FOR EV FINANCING
              </button>
              
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">EV Charging Infrastructure</h3>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <div className="flex items-center mb-3">
                    <div className="w-2 h-10 bg-[#00a6b6] rounded-full mr-3"></div>
                    <div>
                      <h4 className="font-medium">GridCars National Charging Network</h4>
                      <p className="text-sm text-gray-600">South Africa's largest EV charging network with over 300 public charging stations nationwide, operated by GridCars.</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div className="p-3 bg-white rounded-lg shadow-sm">
                      <div className="text-base sm:text-lg font-bold text-[#00a6b6]">CCS</div>
                      <div className="text-[8px] sm:text-xs text-gray-600 leading-tight">DC fast charging up to 100kW</div>
                    </div>
                    <div className="p-3 bg-white rounded-lg shadow-sm">
                      <div className="text-base sm:text-lg font-bold text-[#00a6b6]">Type 2</div>
                      <div className="text-[8px] sm:text-xs text-gray-600 leading-tight">AC charging for all EVs</div>
                    </div>
                    <div className="p-3 bg-white rounded-lg shadow-sm">
                      <div className="text-base sm:text-lg font-bold text-[#00a6b6]">CHAdeMO</div>
                      <div className="text-[8px] sm:text-xs text-gray-600 leading-tight">DC charging support</div>
                    </div>
                  </div>
                </div>
                
                <EVChargerMap height="350px" />
                <p className="text-xs text-gray-600 mt-2 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-[#00a6b6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Map provided by GridCars. Explore over 300 charging stations across South Africa.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Visuals page hidden for now - keeping code for future use */}
        {/* {activeTab === 'visuals' && (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Loan Term Selection</h2>
                <div className="w-1/3">
                  <input
                    type="range"
                    min="12"
                    max="84"
                    step="12"
                    value={loanTerm}
                    onChange={(e) => setLoanTerm(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="text-right text-sm text-gray-600 mt-1">
                    {loanTerm} months ({Math.round(loanTerm/12 * 10) / 10} years)
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="text-center">
                  <h3 className="text-lg font-medium mb-2">Total Estimated Savings Over Selected Term</h3>
                  <div className="text-3xl font-bold text-[#00a6b6]">
                    {(() => {
                      // Calculate Term Finance Savings
                      const originalPayment = Math.round(computeMonthlyPayment(vehicleValue + 1213, 11.46, loanTerm) + 69);
                      
                      // Dynamic calculation for benefits scenario
                      let upfrontSavings = interestRateSavings;
                      if (ebucksEnabled && !hasNoBank) {
                        upfrontSavings += calculatePresentValueEbucks(ebucksLevel, {
                          useInsurance: hasInsurance,
                          useFinancing: hasFinancing,
                          useNoBank: hasNoBank
                        });
                      }
                      
                      // Principal amount is vehicle value minus upfront savings
                      const principalAmount = vehicleValue - upfrontSavings;
                      const monthlyRate = 10.8 / 100 / 12;
                      const basePayment = (principalAmount * monthlyRate) / 
                        (1 - Math.pow(1 + monthlyRate, -loanTerm));
                      const benefitsPayment = Math.round(basePayment + 69);
                      
                      // Calculate total term finance savings over loan term
                      const termFinanceSavings = (originalPayment - benefitsPayment) * loanTerm;
                      
                      // Total savings is term finance savings + fuel savings
                      const totalSavings = termFinanceSavings + rawFuelSpendSavings;
                      
                      return `R${totalSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-6">Savings Breakdown</h2>
              <div className="h-72 mb-6">
                <Bar data={barChartData} options={chartOptions} />
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-2">Total Estimated Savings</h3>
                <div className="text-3xl font-bold text-[#00a6b6]">
                  {(() => {
                    // Calculate Term Finance Savings
                    const originalPayment = Math.round(computeMonthlyPayment(vehicleValue + 1213, 11.46, loanTerm) + 69);
                    
                    // Dynamic calculation for benefits scenario
                    let upfrontSavings = interestRateSavings;
                    if (ebucksEnabled && !hasNoBank) {
                      upfrontSavings += calculatePresentValueEbucks(ebucksLevel, {
                        useInsurance: hasInsurance,
                        useFinancing: hasFinancing,
                        useNoBank: hasNoBank
                      });
                    }
                    
                    // Principal amount is vehicle value minus upfront savings
                    const principalAmount = vehicleValue - upfrontSavings + 1213;
                    const monthlyRate = 11.46 / 100 / 12;
                    const basePayment = (principalAmount * monthlyRate) / 
                      (1 - Math.pow(1 + monthlyRate, -loanTerm));
                    const benefitsPayment = Math.round(basePayment + 69);
                    
                    // Calculate total term finance savings over loan term
                    const termFinanceSavings = (originalPayment - benefitsPayment) * loanTerm;
                    
                    // Total savings is term finance savings + fuel savings
                    const totalSavings = termFinanceSavings + rawFuelSpendSavings;
                    
                    return `R${termFinanceSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  })()}
                </div>
                <div className="text-sm text-gray-600">over {Math.round(loanTerm/12 * 10) / 10} years</div>
                <div className="mt-2 text-xs text-[#00a6b6]">
                  <span className="font-medium">Note:</span> Upfront benefits are always calculated over 5 years
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              {ebucksEnabled ? (
                <>
                  <h2 className="text-xl font-semibold mb-6">Upfront Savings Composition</h2>
                  <div className="h-72 mb-6">
                    <Pie 
                      data={pieChartData} 
                      options={{
                        ...pieChartOptions,
                        plugins: {
                          ...pieChartOptions.plugins,
                          datalabels: {
                            formatter: (value: number) => {
                              const total = displayedUpfrontSavings;
                              return total > 0 ? `${Math.round((value / total) * 100)}%` : '';
                            },
                            color: '#fff',
                            font: {
                              weight: 'bold',
                              size: 16
                            }
                          }
                        }
                      }} 
                    />
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-medium mb-2">Total Upfront Savings</h3>
                    <div className="text-3xl font-bold text-[#00a6b6]">R{displayedUpfrontSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="flex justify-between mt-2">
                      {ebucksEnabled && ebucksValue > 0 && (
                        <div className="flex items-center">
                          <div className="w-4 h-4 bg-[#00a6b6] rounded-full mr-2"></div>
                          <span>eBucks: {ebucksPercentage}%</span>
                        </div>
                      )}
                      <div className="flex items-center">
                        <div className="w-4 h-4 bg-[#ffc107] rounded-full mr-2"></div>
                        <span>15Bps Funding: {totalUpfrontSavings > 0 ? Math.round((interestRateSavings / totalUpfrontSavings) * 100) : 0}%</span>
                      </div>
                      {showCarbonTax && (
                        <div className="flex items-center">
                          <div className="w-4 h-4 bg-[#4CAF50] rounded-full mr-2"></div>
                          <span>Carbon Tax: {carbonPercentage}%</span>
                        </div>
                      )}
                    </div>
                    {ebucksEnabled && hasNoBank && (
                      <div className="mt-3 pt-2 border-t border-gray-200 text-sm">
                        <div className="font-medium">With FirstRand Banking (Level 4): R{standard5YearUpfront.upfrontSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                                    <h2 className="text-xl font-semibold mb-6">Cumulative Trees Planted Equivalent</h2>
                  <div className="h-72 mb-6">
                    <Line 
                      data={{
                        labels: Array.from({ length: loanTermYears }, (_, i) => `Year ${i + 1}`),
                        datasets: [
                          {
                            label: 'Trees Planted Equivalent',
                            data: Array.from({ length: loanTermYears }, (_, i) => 
                              Math.round(results.co2Emissions.yearlySavings * (i + 1) / 22)
                            ),
                            borderColor: 'rgba(34, 197, 94, 1)',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            tension: 0.4,
                            fill: true,
                            borderWidth: 3,
                            pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                            pointBorderColor: 'rgba(255, 255, 255, 1)',
                            pointBorderWidth: 2,
                            pointRadius: 6,
                            pointHoverRadius: 8
                          }
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            display: false
                          },
                          tooltip: {
                            callbacks: {
                              label: function(context: any) {
                                return `${context.raw.toLocaleString()} trees planted equivalent`;
                              }
                            }
                          },
                          title: {
                            display: true,
                            text: 'Environmental Impact Over Time',
                            font: {
                              size: 16,
                              weight: 'bold'
                            },
                            color: '#374151'
                          }
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            title: {
                              display: true,
                              text: 'Trees Planted Equivalent',
                              font: {
                                size: 14,
                                weight: 'bold'
                              },
                              color: '#374151'
                            },
                            ticks: {
                              callback: function(value: any) {
                                return value.toLocaleString() + ' trees';
                              }
                            },
                            grid: {
                              color: 'rgba(226, 232, 240, 0.5)'
                            }
                          },
                          x: {
                            title: {
                              display: true,
                              text: 'Years',
                              font: {
                                size: 14,
                                weight: 'bold'
                              },
                              color: '#374151'
                            },
                            grid: {
                              color: 'rgba(226, 232, 240, 0.5)'
                            }
                          }
                        }
                      }}
                    />
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <h3 className="text-lg font-medium mb-2">Total CO₂ Savings</h3>
                        <div className="text-3xl font-bold text-[#4CAF50]">
                          {Math.round(results.co2Emissions.yearlySavings * loanTermYears).toLocaleString()} kg
                        </div>
                        <div className="text-sm text-gray-600">Over {loanTermYears} year{loanTermYears > 1 ? 's' : ''}</div>
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-medium mb-2">Environmental Equivalent</h3>
                        <div className="text-3xl font-bold text-[#228B22]">
                          {Math.round(results.co2Emissions.yearlySavings * loanTermYears / 22).toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600">Trees planted equivalent</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-3 gap-4 text-center text-sm">
                        <div>
                          <div className="font-medium text-gray-700">Monthly Savings</div>
                          <div className="text-lg font-bold text-[#4CAF50]">
                            {results.co2Emissions.monthlySavings.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-700">Yearly Savings</div>
                          <div className="text-lg font-bold text-[#4CAF50]">
                            {results.co2Emissions.yearlySavings.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-700">Grid Efficiency</div>
                          <div className="text-lg font-bold text-[#00a6b6]">
                            {hasSolar ? '90% Cleaner' : '80% Cleaner'}
                          </div>
                          <div className="text-xs text-gray-500">vs ICE vehicle</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
              <h2 className="text-xl font-semibold mb-6">Fuel Cost vs EV Charging Over Loan Term</h2>
              <div className="h-96 mb-6">
                <Line 
                  data={fuelComparisonChartData} 
                  options={fuelComparisonChartOptions} 
                />
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className={`p-4 rounded-lg ${fuelType === 'petrol95' ? 'bg-[#00a6b6] text-white' : 'bg-gray-100'} col-span-3 sm:col-span-1`}>
                    <h3 className="font-medium mb-2">Petrol 95</h3>
                    <div className="text-lg font-bold">R21.62/L</div>
                    <div className="text-sm opacity-80">9L/100km</div>
                  </div>
                  <div className={`p-4 rounded-lg ${fuelType === 'petrol93' ? 'bg-[#00a6b6] text-white' : 'bg-gray-100'} col-span-3 sm:col-span-1`}>
                    <h3 className="font-medium mb-2">Petrol 93</h3>
                    <div className="text-lg font-bold">R21.51/L</div>
                    <div className="text-sm opacity-80">9L/100km</div>
                  </div>
                  <div className={`p-4 rounded-lg ${fuelType === 'diesel' ? 'bg-[#00a6b6] text-white' : 'bg-gray-100'} col-span-3 sm:col-span-1`}>
                    <h3 className="font-medium mb-2">Diesel</h3>
                    <div className="text-lg font-bold">R19.32/L</div>
                    <div className="text-sm opacity-80">8L/100km</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
              <h2 className="text-xl font-semibold mb-6">CO₂ Emissions Reduction</h2>
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <div className="h-72 mb-4">
                    <Bar 
                      data={co2EmissionsChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          title: {
                            display: true,
                            text: 'Monthly CO₂ Emissions Comparison',
                            font: {
                              size: 16
                            }
                          },
                          datalabels: {
                            formatter: (value: number) => `${value.toFixed(0)} kg`,
                            color: '#fff',
                            font: {
                              weight: 'bold'
                            }
                          }
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="bg-gray-50 p-6 rounded-lg w-full">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-medium mb-2">Monthly CO₂ Emission Savings</h3>
                      <div className="text-4xl font-bold text-[#4CAF50]">
                        {results.co2Emissions.monthlySavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                      </div>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div>ICE Vehicle Emissions:</div>
                        <div className="text-right font-medium">
                          {results.co2Emissions.ice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/month
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>EV Emissions:</div>
                        <div className="text-right font-medium">
                          {results.co2Emissions.ev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/month
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                        <div>Yearly Savings:</div>
                        <div className="text-right font-medium text-[#4CAF50]">
                          {results.co2Emissions.yearlySavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/year
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>Equivalent to:</div>
                        <div className="text-right font-medium">
                          {Math.round(results.co2Emissions.yearlySavings / 22)} trees planted/year
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>Over Loan Term:</div>
                        <div className="text-right font-medium text-[#4CAF50]">
                          {Math.round(results.co2Emissions.yearlySavings * loanTermYears).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
              <h2 className="text-xl font-semibold mb-6">Comparison Between Fuel Types</h2>
              <div className="grid grid-cols-3 gap-4 mb-6 text-center">
                <div className={`p-4 rounded-lg ${fuelType === 'petrol95' ? 'bg-[#00a6b6] text-white' : 'bg-gray-100'} col-span-3 sm:col-span-1`}>
                  <h3 className="font-medium mb-2">Petrol 95</h3>
                  <div className="text-lg font-bold">R21.62/L</div>
                  <div className="text-sm opacity-80">9L/100km</div>
                </div>
                <div className={`p-4 rounded-lg ${fuelType === 'petrol93' ? 'bg-[#00a6b6] text-white' : 'bg-gray-100'} col-span-3 sm:col-span-1`}>
                  <h3 className="font-medium mb-2">Petrol 93</h3>
                  <div className="text-lg font-bold">R21.51/L</div>
                  <div className="text-sm opacity-80">9L/100km</div>
                </div>
                <div className={`p-4 rounded-lg ${fuelType === 'diesel' ? 'bg-[#00a6b6] text-white' : 'bg-gray-100'} col-span-3 sm:col-span-1`}>
                  <h3 className="font-medium mb-2">Diesel</h3>
                  <div className="text-lg font-bold">R19.32/L</div>
                  <div className="text-sm opacity-80">8L/100km</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg col-span-2 md:col-span-1">
                  <h3 className="text-lg font-medium mb-2">Monthly Fuel Cost</h3>
                  <div className="text-2xl font-bold text-[#00a6b6]">
                    R{Math.round(distance * (fuelType === 'petrol95' ? 9 : fuelType === 'petrol93' ? 9 : 8) / 100 * 
                    (fuelType === 'petrol95' ? 21.62 : fuelType === 'petrol93' ? 21.51 : 19.32)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg col-span-2 md:col-span-1">
                  <h3 className="text-lg font-medium mb-2">
                    {vehicleType === 'ev' ? 'EV Charging Cost' : 
                     vehicleType === 'phev' ? 'PHEV Charging Cost' : 
                     'Hybrid Fuel Cost'}
                  </h3>
                  <div className="text-2xl font-bold text-[#00a6b6]">
                    R{Math.round(vehicleType === 'hybrid' ? calculateNEVMonthlyFuelCost() : calculateMonthlyChargingCost()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-sm text-gray-600">
                    {vehicleType === 'ev' ? (hasSolar ? 'With Solar Power (10% of normal cost)' : '90% standard / 10% premium rate') :
                     vehicleType === 'phev' ? (hasSolar ? 'With Solar Power (10% of normal cost)' : '90% standard / 10% premium rate') :
                     '40% less fuel consumption than ICE'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )} */}
      </main>

      <footer className="bg-[#008a97] text-white py-6 mt-12">
        <div className="container mx-auto px-4 text-center text-sm">
          <p>This calculator is based on assumptions including:</p>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div>
              <p>• Fuel prices: R19.32-R21.62/L</p>
              <p>• Fuel consumption: 8-9L/100km</p>
              <p>• EV consumption: 0.189 kWh/km</p>
              <p>• Electricity rate: 90% @ R3.7/kWh + 10% @ R7/kWh</p>
            </div>
            <div>
              <p>• eBucks rates: R0.15-R3.00/L</p>
              <p>• Monthly fuel cap: R3,000</p>
              <p>• Fuel inflation: 7.5% annually</p>
              <p>• CO₂ emissions: 2.35kg/L</p>
            </div>
            <div>
              <p>• Discount rate: 10.95%</p>
              <p>• Interest rate discount: 14.85%</p>
              <p>• Carbon tax: R236-R495/tonne</p>
              <p>• Upfront benefits: Always 5 years</p>
              <p>• Electricity inflation: 10.62%</p>
              <p>• Solar charging: 10% of normal cost</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;