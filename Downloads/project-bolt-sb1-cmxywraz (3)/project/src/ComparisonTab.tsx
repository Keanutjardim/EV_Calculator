import React, { useState } from 'react';
import axios from 'axios';
import { Bar, Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Chart as ChartJS, registerables } from 'chart.js';

// Register ChartJS components
ChartJS.register(...registerables, ChartDataLabels);

interface CarDetails {
  price: number;
  fuelEfficiency: number;
  fuelType: string;
  isMockData?: boolean;
  message?: string;
}

interface ComparisonResults {
  electric: {
    price: number;
    monthlyPayment: number;
    monthlyPaymentWithoutBenefits: number;
    fuelCost: number;
    totalMonthlyCost: number;
    fuelEfficiency: number;
    fuelType: string;
    loanTerm: number;
    isMockData?: boolean;
  };
  petrol: {
    price: number;
    monthlyPayment: number;
    monthlyPaymentWithoutBenefits: number;
    fuelCost: number;
    totalMonthlyCost: number;
    fuelEfficiency: number;
    fuelType: string;
    loanTerm: number;
    isMockData?: boolean;
  };
  savings: {
    monthlySavings: number;
    fuelSavings: number;
    carbonSavings: number;
    totalFuelSavings: number;
    termFinanceSavings: number;
  };
  cumulativeData: {
    labels: string[];
    electricCosts: number[];
    petrolCosts: number[];
    savings: number[];
  };
}

const FUEL_CONSUMPTION = {
  petrol95: 8.0,
  petrol93: 8.2,
  diesel: 6.5
};

const ComparisonTab: React.FC = () => {
  const [electricUrl, setElectricUrl] = useState<string>('');
  const [petrolUrl, setPetrolUrl] = useState<string>('');
  const [electricLoanTerm, setElectricLoanTerm] = useState<number>(60);
  const [petrolLoanTerm, setPetrolLoanTerm] = useState<number>(60);
  const [monthlyDistance, setMonthlyDistance] = useState<number>(1600);
  const [iceVehiclePrice, setIceVehiclePrice] = useState<number>(350000);
  const [evVehiclePrice, setEvVehiclePrice] = useState<number>(750000);
  const [fuelType, setFuelType] = useState<string>('petrol95');
  const [loanTerm, setLoanTerm] = useState<number>(60);
  const [hasSolar, setHasSolar] = useState<boolean>(false);
  const [hasBenefits, setHasBenefits] = useState<boolean>(true); // New state for benefits
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ComparisonResults | null>(null);
  const [scrapingLog, setScrapingLog] = useState<string>('');
  
  // Interest rate calculation based on benefits
  const primeRate = 11.75; // Current prime rate
  const benefitsAdjustment = 0.46; // Additional 0.46% when benefits are included
  const adminFee = 69; // R69 admin fee
  
  // Interest rates for fuel savings only mode
  const iceInterestRate = hasBenefits ? primeRate + benefitsAdjustment : primeRate + benefitsAdjustment;
  const evInterestRate = hasBenefits ? primeRate + benefitsAdjustment : primeRate;
  const interestRateWithoutBenefits = primeRate; // Always prime rate without benefits
  
  // Constants for CO2 calculations
  const CO2_GRID = 0.9;   // 0.9 kg CO2 per kWh for grid electricity
  const CO2_SOLAR = 0.09;  // 0.09 kg CO2 per kWh for solar (not zero)
  const CO2_PER_LITER = 2.35; // kg CO2 per liter

  // Function to fetch car details from the server with improved error handling
  const fetchCarDetails = async (url: string): Promise<CarDetails> => {
    try {
      console.log(`Fetching car details for URL: ${url}`);
      setScrapingLog(prev => prev + `\nFetching car details for URL: ${url}`);
      
      // Add timeout to the request to prevent hanging
      const response = await axios.post('/scrape-vehicle', { url }, { 
        timeout: 30000  // 30 second timeout
      });
      
      // Check if there's valid data in the response
      if (response.data && response.data.price > 0 && response.data.fuelEfficiency > 0) {
        console.log('Successfully scraped vehicle data:', response.data);
        setScrapingLog(prev => prev + `\nSuccessfully scraped data: ${JSON.stringify(response.data)}`);
        
        // Flag as mock data if the response indicates it is
        if (response.data.isMockData) {
          setScrapingLog(prev => prev + `\nNOTE: This includes estimated values for some fields that couldn't be directly scraped.`);
        }
        
        return response.data;
      } else {
        throw new Error("Invalid or incomplete data received from scraping");
      }
    } catch (error) {
      console.error('Error fetching car details:', error);
      let errorMessage = 'Failed to fetch vehicle details. Using estimated values instead.';
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          errorMessage = 'Request timed out. Using estimated values instead.';
        } else if (error.response) {
          errorMessage = `Error ${error.response.status}: ${error.response.data?.error || 'Unknown error'} - Using estimated values.`;
        }
      }
      
      setScrapingLog(prev => prev + `\nError: ${errorMessage}`);
      
      // Generate fallback data based on URL
      const isElectric = url.toLowerCase().includes('electric') || url.toLowerCase().includes('ev');
      
      const fallbackData: CarDetails = {
        price: isElectric ? 750000 : 300000,
        fuelEfficiency: isElectric ? 18.0 : 8.0,
        fuelType: isElectric ? 'Electric' : 'Petrol',
        isMockData: true,
        message: 'Using estimated values as actual data could not be retrieved'
      };
      
      setScrapingLog(prev => prev + `\nUsing estimated data: ${JSON.stringify(fallbackData)}`);
      return fallbackData;
    }
  };

  // Calculate monthly loan payment
  const computeMonthlyPayment = (principal: number, annualRate: number, termMonths: number): number => {
    const monthlyRate = annualRate / 100 / 12;
    return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  };

  // Calculate fuel cost
  const computeFuelCost = (carDetails: CarDetails, distance: number, useSolar: boolean): { cost: number; emissions: number } => {
    if (carDetails.fuelType.toLowerCase().includes('electric')) {
      // For electric vehicles
      const energyUsed = (distance / 100) * carDetails.fuelEfficiency;
      
      if (useSolar) {
        // Solar powered EVs - no cost but still have lifecycle emissions
        return { 
          cost: 0, 
          emissions: energyUsed * CO2_SOLAR 
        };
      } else {
        // Grid powered EVs
        // 90% at standard rate, 10% at premium rate
        const standardRate = 3.7;
        const premiumRate = 7.0;
        const combinedRate = (standardRate * 0.9) + (premiumRate * 0.1);
        const cost = energyUsed * combinedRate;
        const emissions = energyUsed * CO2_GRID;
        return { cost, emissions };
      }
    } else {
      // For ICE vehicles
      const litersUsed = (distance / 100) * carDetails.fuelEfficiency;
      const cost = litersUsed * 21.0; // R21 per liter (kept as an average for petrol/diesel)
      const emissions = litersUsed * CO2_PER_LITER;
      return { cost, emissions };
    }
  };

  // Calculate cumulative fuel costs over time
  const generateCumulativeFuelCost = (initialFuelCost: number, totalPeriod: number, fuelType: string): number[] => {
    const annualInflation = fuelType.toLowerCase().includes('electric') ? 0.05 : 0.09; // Updated from 0.10 to 0.09 for petrol
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

  const handleCompare = async () => {
    if (hasBenefits && (!electricUrl || !petrolUrl)) {
      setError('Please enter both vehicle URLs');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setScrapingLog('Starting vehicle scraping...');

      let electricCar: CarDetails;
      let petrolCar: CarDetails;
      
      if (hasBenefits) {
        // Fetch car details from URLs for benefits mode
        electricCar = await fetchCarDetails(electricUrl);
        petrolCar = await fetchCarDetails(petrolUrl);
      } else {
        // Use manual inputs for fuel savings only mode
        electricCar = {
          price: evVehiclePrice,
          fuelEfficiency: 18.0, // kWh/100km for EVs
          fuelType: 'Electric'
        };
        petrolCar = {
          price: iceVehiclePrice,
          fuelEfficiency: FUEL_CONSUMPTION[fuelType as keyof typeof FUEL_CONSUMPTION] || 8.0,
          fuelType: fuelType
        };
      }

      // Log results for debugging
      setScrapingLog(prev => prev + '\nVehicle data obtained:' +
        `\nElectric: Price: R${electricCar.price.toLocaleString()}, Efficiency: ${electricCar.fuelEfficiency} ${electricCar.fuelType.toLowerCase().includes('electric') ? 'kWh' : 'L'}/100km` +
        `\nPetrol: Price: R${petrolCar.price.toLocaleString()}, Efficiency: ${petrolCar.fuelEfficiency} L/100km` +
        `\nInterest Rates: ICE: ${iceInterestRate.toFixed(2)}%, EV: ${evInterestRate.toFixed(2)}%`);

      // Calculate monthly loan payments using different interest rates
      const currentLoanTerm = hasBenefits ? electricLoanTerm : loanTerm;
      const currentPetrolLoanTerm = hasBenefits ? petrolLoanTerm : loanTerm;
      
      const electricPayment = computeMonthlyPayment(electricCar.price, evInterestRate, currentLoanTerm) + adminFee;
      const petrolPayment = computeMonthlyPayment(petrolCar.price, iceInterestRate, currentPetrolLoanTerm) + adminFee;

      // Always calculate payments without benefits for comparison (at prime rate)
      const electricPaymentWithoutBenefits = computeMonthlyPayment(electricCar.price, primeRate, currentLoanTerm) + adminFee;
      const petrolPaymentWithoutBenefits = computeMonthlyPayment(petrolCar.price, primeRate, currentPetrolLoanTerm) + adminFee;

      // Calculate monthly fuel costs
      const electricFuelData = computeFuelCost(electricCar, monthlyDistance, hasSolar);
      const petrolFuelData = computeFuelCost(petrolCar, monthlyDistance, false);

      const electricFuelCost = electricFuelData.cost;
      const petrolFuelCost = petrolFuelData.cost;

      // Calculate total monthly costs
      const electricTotal = electricPayment + electricFuelCost;
      const petrolTotal = petrolPayment + petrolFuelCost;

      // Calculate savings
      const monthlySavings = petrolTotal - electricTotal;
      const fuelSavings = petrolFuelCost - electricFuelCost;
      const carbonSavings = petrolFuelData.emissions - electricFuelData.emissions;

      // Calculate term finance savings ONLY when benefits are enabled
      let totalTermFinanceSavings = 0;
      if (hasBenefits) {
        const electricTermSavings = (electricPaymentWithoutBenefits - electricPayment) * currentLoanTerm;
        const petrolTermSavings = (petrolPaymentWithoutBenefits - petrolPayment) * currentPetrolLoanTerm;
        totalTermFinanceSavings = electricTermSavings + petrolTermSavings;
      }

      // Calculate cumulative fuel costs
      const totalPeriod = Math.max(currentLoanTerm, currentPetrolLoanTerm);
      const cumElectricFuel = hasSolar ? Array(totalPeriod).fill(0) : generateCumulativeFuelCost(electricFuelCost, totalPeriod, electricCar.fuelType);
      const cumPetrolFuel = generateCumulativeFuelCost(petrolFuelCost, totalPeriod, petrolCar.fuelType);
      
      // Calculate total fuel savings
      const totalFuelSavings = cumPetrolFuel[cumPetrolFuel.length - 1] - cumElectricFuel[cumElectricFuel.length - 1];

      // Create labels for chart (e.g., "Month 1", "Month 2", etc.)
      const labels = Array.from({ length: totalPeriod }, (_, i) => `Month ${i + 1}`);
      
      // Calculate cumulative savings for each month
      const cumulativeSavings = cumPetrolFuel.map((petrolCost, index) => petrolCost - cumElectricFuel[index]);

      setResults({
        electric: {
          price: electricCar.price,
          monthlyPayment: parseFloat(electricPayment.toFixed(2)),
          monthlyPaymentWithoutBenefits: parseFloat(electricPaymentWithoutBenefits.toFixed(2)),
          fuelCost: parseFloat(electricFuelCost.toFixed(2)),
          totalMonthlyCost: parseFloat(electricTotal.toFixed(2)),
          fuelEfficiency: electricCar.fuelEfficiency,
          fuelType: electricCar.fuelType,
          loanTerm: currentLoanTerm,
          isMockData: electricCar.isMockData
        },
        petrol: {
          price: petrolCar.price,
          monthlyPayment: parseFloat(petrolPayment.toFixed(2)),
          monthlyPaymentWithoutBenefits: parseFloat(petrolPaymentWithoutBenefits.toFixed(2)),
          fuelCost: parseFloat(petrolFuelCost.toFixed(2)),
          totalMonthlyCost: parseFloat(petrolTotal.toFixed(2)),
          fuelEfficiency: petrolCar.fuelEfficiency,
          fuelType: petrolCar.fuelType,
          loanTerm: currentPetrolLoanTerm,
          isMockData: petrolCar.isMockData
        },
        savings: {
          monthlySavings: parseFloat(monthlySavings.toFixed(2)),
          fuelSavings: parseFloat(fuelSavings.toFixed(2)),
          carbonSavings: parseFloat(carbonSavings.toFixed(2)),
          totalFuelSavings: parseFloat(totalFuelSavings.toFixed(2)),
          termFinanceSavings: parseFloat(totalTermFinanceSavings.toFixed(2))
        },
        cumulativeData: {
          labels,
          electricCosts: cumElectricFuel.map(cost => parseFloat(cost.toFixed(2))),
          petrolCosts: cumPetrolFuel.map(cost => parseFloat(cost.toFixed(2))),
          savings: cumulativeSavings.map(saving => parseFloat(saving.toFixed(2)))
        }
      });
      
      setScrapingLog(prev => prev + '\nComparison completed successfully!');
    } catch (error) {
      let errorMessage = 'Error comparing vehicles. Please try again.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      setError(errorMessage);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderComparisonForm = () => (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-6">Vehicle Comparison</h2>
      
      <div className="space-y-6">
        {hasBenefits ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Electric Vehicle URL (from Autotrader)</label>
              <input
                type="text"
                value={electricUrl}
                onChange={(e) => setElectricUrl(e.target.value)}
                placeholder="Enter electric vehicle URL"
                className="w-full border border-gray-300 rounded-md py-2 px-3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Petrol Vehicle URL (from Autotrader)</label>
              <input
                type="text"
                value={petrolUrl}
                onChange={(e) => setPetrolUrl(e.target.value)}
                placeholder="Enter petrol vehicle URL"
                className="w-full border border-gray-300 rounded-md py-2 px-3"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ICE Vehicle Price</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">R</span>
                <input
                  type="number"
                  value={iceVehiclePrice}
                  onChange={(e) => setIceVehiclePrice(Number(e.target.value))}
                  placeholder="Enter ICE vehicle price"
                  className="w-full border border-gray-300 rounded-md py-2 px-3 pl-8"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Electric Vehicle Price</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">R</span>
                <input
                  type="number"
                  value={evVehiclePrice}
                  onChange={(e) => setEvVehiclePrice(Number(e.target.value))}
                  placeholder="Enter EV vehicle price"
                  className="w-full border border-gray-300 rounded-md py-2 px-3 pl-8"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fuel Type</label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
                className="w-full border border-gray-300 rounded-md py-2 px-3"
              >
                <option value="petrol95">Petrol 95</option>
                <option value="petrol93">Petrol 93</option>
                <option value="diesel">Diesel</option>
              </select>
            </div>
          </>
        )}

        {hasBenefits ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Electric Vehicle Loan Term (months)</label>
              <input
                type="range"
                min="12"
                max="84"
                step="12"
                value={electricLoanTerm}
                onChange={(e) => setElectricLoanTerm(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-right text-sm text-gray-600 mt-1">{electricLoanTerm} months</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Petrol Vehicle Loan Term (months)</label>
              <input
                type="range"
                min="12"
                max="84"
                step="12"
                value={petrolLoanTerm}
                onChange={(e) => setPetrolLoanTerm(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="text-right text-sm text-gray-600 mt-1">{petrolLoanTerm} months</div>
            </div>
          </div>
        ) : (
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
            <div className="text-right text-sm text-gray-600 mt-1">{loanTerm} months</div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Monthly Distance (km)</label>
            <input
              type="range"
              min="500"
              max="5000"
              step="100"
              value={monthlyDistance}
              onChange={(e) => setMonthlyDistance(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-right text-sm text-gray-600 mt-1">{monthlyDistance} km</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hasBenefits && <div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="benefits"
                checked={hasBenefits}
                onChange={(e) => setHasBenefits(e.target.checked)}
                className="h-4 w-4 text-[#00a6b6] rounded"
              />
              <label htmlFor="benefits" className="ml-2 text-sm text-gray-700">WesBank Benefits (eBucks, Insurance, etc.)</label>
            </div>
            <div className="text-xs text-gray-500 mt-1 ml-6">
              Affects interest rate: {hasBenefits ? 'Prime + 0.46%' : 'Prime rate only'}
            </div>
          </div>}

          <div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="solar"
                checked={hasSolar}
                onChange={(e) => setHasSolar(e.target.checked)}
                className="h-4 w-4 text-[#00a6b6] rounded"
              />
              <label htmlFor="solar" className="ml-2 text-sm text-gray-700">Home Solar Power (free EV charging)</label>
            </div>
          </div>
        </div>

        {/* Interest Rate Display */}
        {!hasBenefits && (
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2">Interest Rates Applied</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">ICE Vehicle:</span> {iceInterestRate.toFixed(2)}% + R{adminFee} admin fee
              </div>
              <div>
                <span className="font-medium">EV Vehicle:</span> {evInterestRate.toFixed(2)}% + R{adminFee} admin fee
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleCompare}
          disabled={isLoading}
          className="w-full bg-[#00a6b6] text-white py-3 rounded-md hover:bg-[#008a97] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'COMPARING...' : 'COMPARE VEHICLES'}
        </button>
        
        {isLoading && (
          <div className="mt-4">
            <h3 className="text-md font-medium mb-2">Scraping Status:</h3>
            <div className="bg-gray-100 p-3 rounded text-xs font-mono whitespace-pre-wrap h-40 overflow-y-auto">
              {scrapingLog}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderComparisonResults = () => {
    if (!results) return null;

    // Chart data for the fuel costs comparison
    const fuelComparisonChartData = {
      labels: results.cumulativeData.labels.filter((_, i) => i % 6 === 0 || i === results.cumulativeData.labels.length - 1),
      datasets: [
        {
          label: 'EV Cumulative Fuel Cost',
          data: results.cumulativeData.electricCosts.filter((_, i) => i % 6 === 0 || i === results.cumulativeData.electricCosts.length - 1),
          borderColor: 'rgba(0, 166, 182, 1)',
          backgroundColor: 'rgba(0, 166, 182, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        },
        {
          label: 'Petrol Cumulative Fuel Cost',
          data: results.cumulativeData.petrolCosts.filter((_, i) => i % 6 === 0 || i === results.cumulativeData.petrolCosts.length - 1),
          borderColor: 'rgba(248, 156, 51, 1)',
          backgroundColor: 'rgba(248, 156, 51, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        },
        {
          label: 'Cumulative Savings',
          data: results.cumulativeData.savings.filter((_, i) => i % 6 === 0 || i === results.cumulativeData.savings.length - 1),
          borderColor: 'rgba(76, 175, 80, 1)',
          backgroundColor: 'rgba(76, 175, 80, 0.0)',
          borderWidth: 3,
          borderDash: [5, 5],
          tension: 0.4,
          fill: false,
          yAxisID: 'y1'
        }
      ]
    };

    // Chart options
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
          text: 'Cumulative Fuel Cost Comparison',
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

    // Monthly cost breakdown chart data
    const monthlyCostChartData = {
      labels: ['Electric Vehicle', 'Petrol Vehicle'],
      datasets: [
        {
          label: 'Monthly Loan Payment',
          data: [results.electric.monthlyPayment, results.petrol.monthlyPayment],
          backgroundColor: 'rgba(0, 166, 182, 0.8)',
          stack: 'Stack 0',
        },
        {
          label: 'Monthly Fuel Cost',
          data: [results.electric.fuelCost, results.petrol.fuelCost],
          backgroundColor: 'rgba(248, 156, 51, 0.8)',
          stack: 'Stack 0',
        }
      ]
    };

    const monthlyCostChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        tooltip: {
          callbacks: {
            label: function(context: any) {
              return context.dataset.label + ': R ' + context.raw.toLocaleString();
            }
          }
        },
        title: {
          display: true,
          text: 'Monthly Cost Breakdown',
          font: {
            size: 16
          }
        }
      },
      scales: {
        y: {
          stacked: true,
          beginAtZero: true,
          title: {
            display: true,
            text: 'Monthly Cost (ZAR)'
          },
          ticks: {
            callback: function(value: any) {
              return 'R ' + value.toLocaleString();
            }
          }
        },
        x: {
          stacked: true
        }
      }
    };
    
    // CO2 Emissions Comparison Chart
    const co2EmissionsChartData = {
      labels: ['ICE Vehicle', 'Electric Vehicle'],
      datasets: [
        {
          label: 'Monthly CO₂ Emissions (kg)',
          data: [
            // ICE vehicle emissions
            results.petrol.fuelType.toLowerCase().includes('electric') ? 0 : 
              (monthlyDistance * results.petrol.fuelEfficiency * CO2_PER_LITER / 100),
            
            // Electric vehicle emissions - CRITICAL FIX
            results.electric.fuelType.toLowerCase().includes('electric') ? 
              (hasSolar ? 
                (monthlyDistance * results.electric.fuelEfficiency * CO2_SOLAR / 100) : 
                (monthlyDistance * results.electric.fuelEfficiency * CO2_GRID / 100)
              ) : 0
          ],
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

    return (
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Comparison Results</h2>
          
          {/* Interest Rate Display */}
          {hasBenefits ? (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-md mb-4">
              <h3 className="font-medium">Interest Rate Applied</h3>
              <p className="text-sm mt-1">
                <span className="font-bold">{iceInterestRate.toFixed(2)}%</span> - 
                {hasBenefits ? ` Prime rate (${primeRate}%) + 0.46% benefits adjustment` : ` Prime rate (${primeRate}%) only`}
              </p>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-md mb-4">
              <h3 className="font-medium">Interest Rates Applied</h3>
              <p className="text-sm mt-1">
                <span className="font-bold">ICE:</span> {iceInterestRate.toFixed(2)}% + R{adminFee} admin fee | 
                <span className="font-bold"> EV:</span> {evInterestRate.toFixed(2)}% + R{adminFee} admin fee
              </p>
            </div>
          )}
          
          {/* Data Reliability Notice */}
          {(results.electric.isMockData || results.petrol.isMockData) && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-md mb-4">
              <h3 className="font-medium">Note About Vehicle Data</h3>
              <p className="text-sm mt-1">
                {results.electric.isMockData && results.petrol.isMockData
                  ? "We're using estimated values for both vehicles as the actual specifications could not be retrieved."
                  : results.electric.isMockData
                  ? "We're using estimated values for the electric vehicle as the actual specifications could not be retrieved."
                  : "We're using estimated values for the petrol vehicle as the actual specifications could not be retrieved."
                }
                <br />
                The comparison is still useful but may not reflect exact values for your specific models.
              </p>
            </div>
          )}
          
          {!hasBenefits ? null : <div className="bg-[#00a6b6] text-white p-6 rounded-lg mb-6">
            <h3 className="text-lg font-medium mb-2">Total Monthly Savings</h3>
            <div className="text-3xl font-bold mb-1">R{results.savings.monthlySavings.toLocaleString()}</div>
            <div className="text-sm opacity-80">by choosing the electric vehicle</div>
          </div>}

          {/* Term Finance Savings Display - Only show when benefits are enabled */}
          {hasBenefits && results.savings.termFinanceSavings > 0 && (
            <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-md mb-4">
              <h3 className="font-medium">Term Finance Savings with WesBank Benefits</h3>
              <div className="text-2xl font-bold text-green-600">R{results.savings.termFinanceSavings.toLocaleString()}</div>
              <p className="text-sm mt-1">
                Total savings from lower interest rate over the loan term
              </p>
              <div className="text-xs mt-2 space-y-1">
                <div>EV monthly savings: R{(results.electric.monthlyPaymentWithoutBenefits - results.electric.monthlyPayment).toLocaleString()}</div>
                <div>Petrol monthly savings: R{(results.petrol.monthlyPaymentWithoutBenefits - results.petrol.monthlyPayment).toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>

        {!hasBenefits ? (
          <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Monthly Cost Breakdown</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* ICE Vehicle Costs */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-[#F89C33]">ICE Vehicle Costs</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Monthly Loan Payment:</span>
                    <span className="font-medium">R{results.petrol.monthlyPayment.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-gray-500 ml-4">
                    ({iceInterestRate.toFixed(2)}% + R{adminFee} admin fee)
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Monthly Fuel Expenses:</span>
                    <span className="font-medium">R{results.petrol.fuelCost.toLocaleString()}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Total Monthly ICE Costs:</span>
                      <span className="font-bold text-[#F89C33] text-lg">R{results.petrol.totalMonthlyCost.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Electric Vehicle Costs */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold mb-4 text-[#00a6b6]">Electric Vehicle Costs</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Monthly Loan Payment:</span>
                    <span className="font-medium">R{results.electric.monthlyPayment.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-gray-500 ml-4">
                    ({evInterestRate.toFixed(2)}% + R{adminFee} admin fee)
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Monthly Electricity Costs:</span>
                    <span className="font-medium">R{results.electric.fuelCost.toLocaleString()}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Total Monthly EV Costs:</span>
                      <span className="font-bold text-[#00a6b6] text-lg">R{results.electric.totalMonthlyCost.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Monthly Savings Summary */}
            <div className="bg-green-50 p-6 rounded-lg mt-6">
              <h3 className="text-lg font-semibold mb-2 text-green-800">Monthly Savings Summary</h3>
              <div className="text-3xl font-bold text-green-600 mb-2">R{results.savings.monthlySavings.toLocaleString()}</div>
              <div className="text-sm text-green-700">by choosing the electric vehicle</div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Electric Vehicle Details</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-md font-medium text-gray-600">Purchase Price</h3>
              <div className="text-xl font-bold text-[#00a6b6]">R{results.electric.price.toLocaleString()}</div>
            </div>
            <div>
              <h3 className="text-md font-medium text-gray-600">Monthly Loan Payment</h3>
              <div className="text-xl font-bold text-[#00a6b6]">R{results.electric.monthlyPayment.toLocaleString()}</div>
              <div className="text-sm text-gray-500">{results.electric.loanTerm} months at {evInterestRate.toFixed(2)}% interest</div>
              {hasBenefits && (
                <div className="text-xs text-green-600 mt-1">
                  Saves R{(results.electric.monthlyPaymentWithoutBenefits - results.electric.monthlyPayment).toLocaleString()}/month vs. prime rate
                </div>
              )}
            </div>
            <div>
              <h3 className="text-md font-medium text-gray-600">Monthly Fuel/Charging Cost</h3>
              <div className="text-xl font-bold text-[#00a6b6]">R{results.electric.fuelCost.toLocaleString()}</div>
              <div className="text-sm text-gray-500">{results.electric.fuelEfficiency} {results.electric.fuelType.toLowerCase().includes('electric') ? 'kWh' : 'L'}/100km × {monthlyDistance} km{hasSolar && results.electric.fuelType.toLowerCase().includes('electric') ? ' (Solar powered)' : ''}</div>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-md font-medium text-gray-600">Total Monthly Cost</h3>
              <div className="text-2xl font-bold text-[#00a6b6]">R{results.electric.totalMonthlyCost.toLocaleString()}</div>
            </div>
          </div>
        </div>
        )}
        
        {hasBenefits && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Petrol Vehicle Details</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-md font-medium text-gray-600">Purchase Price</h3>
              <div className="text-xl font-bold text-[#F89C33]">R{results.petrol.price.toLocaleString()}</div>
            </div>
            <div>
              <h3 className="text-md font-medium text-gray-600">Monthly Loan Payment</h3>
              <div className="text-xl font-bold text-[#F89C33]">R{results.petrol.monthlyPayment.toLocaleString()}</div>
              <div className="text-sm text-gray-500">{results.petrol.loanTerm} months at {iceInterestRate.toFixed(2)}% interest</div>
              {hasBenefits && (
                <div className="text-xs text-green-600 mt-1">
                  Saves R{(results.petrol.monthlyPaymentWithoutBenefits - results.petrol.monthlyPayment).toLocaleString()}/month vs. prime rate
                </div>
              )}
            </div>
            <div>
              <h3 className="text-md font-medium text-gray-600">Monthly Fuel Cost</h3>
              <div className="text-xl font-bold text-[#F89C33]">R{results.petrol.fuelCost.toLocaleString()}</div>
              <div className="text-sm text-gray-500">{results.petrol.fuelEfficiency} L/100km × {monthlyDistance} km</div>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-md font-medium text-gray-600">Total Monthly Cost</h3>
              <div className="text-2xl font-bold text-[#F89C33]">R{results.petrol.totalMonthlyCost.toLocaleString()}</div>
            </div>
          </div>
        </div>
        )}

        {hasBenefits && <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Monthly Cost Breakdown</h2>
          <div className="h-72 mb-6">
            <Bar data={monthlyCostChartData} options={monthlyCostChartOptions} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-2">Monthly Savings</h3>
              <div className="text-2xl font-bold text-[#00a6b6]">R{results.savings.monthlySavings.toLocaleString()}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-2">Monthly Fuel Savings</h3>
              <div className="text-2xl font-bold text-[#4CAF50]">R{results.savings.fuelSavings.toLocaleString()}</div>
            </div>
            {hasBenefits && results.savings.termFinanceSavings > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-2">Term Finance Savings</h3>
                <div className="text-2xl font-bold text-[#4CAF50]">R{results.savings.termFinanceSavings.toLocaleString()}</div>
                <div className="text-sm text-gray-500">over loan term</div>
              </div>
            )}
          </div>
        </div>
        }
        <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
          <h2 className="text-xl font-semibold mb-4">CO₂ Emissions Reduction</h2>
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
                    {results.savings.carbonSavings.toFixed(1)} kg
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                    <div>Yearly Savings:</div>
                    <div className="text-right font-medium text-[#4CAF50]">
                      {(results.savings.carbonSavings * 12).toFixed(1)} kg/year
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Equivalent to:</div>
                    <div className="text-right font-medium">
                      {Math.round(results.savings.carbonSavings * 12 / 22)} trees planted/year
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Over Loan Term:</div>
                    <div className="text-right font-medium text-[#4CAF50]">
                      {Math.round(results.savings.carbonSavings * Math.max(results.electric.loanTerm, results.petrol.loanTerm) / 1000).toFixed(1)} tonnes
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {hasBenefits && <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Cumulative Fuel Cost Comparison</h2>
          <div className="h-96 mb-6">
            <Line data={fuelComparisonChartData} options={fuelComparisonChartOptions} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-2">Total EV Fuel Cost</h3>
              <div className="text-2xl font-bold text-[#00a6b6]">
                R{results.cumulativeData.electricCosts[results.cumulativeData.electricCosts.length - 1].toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">over {Math.max(results.electric.loanTerm, results.petrol.loanTerm)} months</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-2">Total Petrol Cost</h3>
              <div className="text-2xl font-bold text-[#F89C33]">
                R{results.cumulativeData.petrolCosts[results.cumulativeData.petrolCosts.length - 1].toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">over {Math.max(results.electric.loanTerm, results.petrol.loanTerm)} months</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium mb-2">Total Fuel Savings</h3>
              <div className="text-2xl font-bold text-[#4CAF50]">
                R{results.savings.totalFuelSavings.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">by choosing the electric vehicle</div>
            </div>
          </div>
        </div>
        }
        <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Environmental Impact</h2>
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="text-center">
              <h3 className="text-lg font-medium mb-2">Monthly CO₂ Emission Savings</h3>
              <div className="text-3xl font-bold text-[#4CAF50] mb-2">{results.savings.carbonSavings.toFixed(1)} kg</div>
              <div className="text-sm text-gray-500">
                That's equivalent to planting approximately {Math.round(results.savings.carbonSavings / 22)} trees each month!
              </div>
            </div>
            <div className="mt-4 text-center">
              <p className="text-gray-600">
                Over the {Math.max(results.electric.loanTerm, results.petrol.loanTerm)} month period, you'll save approximately 
                <span className="font-bold text-[#4CAF50]"> {(results.savings.carbonSavings * Math.max(results.electric.loanTerm, results.petrol.loanTerm) / 1000).toFixed(1)} tonnes </span> 
                of CO₂ emissions!
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
          <button
            onClick={() => setResults(null)}
            className="w-full bg-gray-200 text-gray-700 py-3 rounded-md hover:bg-gray-300 transition-colors"
          >
            COMPARE ANOTHER VEHICLE
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {!results ? renderComparisonForm() : renderComparisonResults()}
    </div>
  );
};

export default ComparisonTab;