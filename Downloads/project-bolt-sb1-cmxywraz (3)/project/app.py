from flask import Flask, request, jsonify, render_template
import math
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={
    r"/calculate": {
        "origins": ["http://localhost:5173", "http://127.0.0.1:5173"],
        "methods": ["POST", "OPTIONS"],
        "allow_headers": ["Content-Type"],
        "supports_credentials": True
    }
})

###############################################################################
# Data & Constants
###############################################################################
# Fuel prices (ZAR per litre) for South African fuel types
FUEL_PRICES = {
    'diesel': 19.32,
    'petrol95': 21.62,
    'petrol93': 21.51,
}

# Fuel consumption in litres per 100 km for each fuel type
FUEL_CONSUMPTION = {
    'diesel': 8,
    'petrol95': 9.5,
    'petrol93': 9.3
}

# eBucks rates (R per litre) – base rates depend on level
BASE_EBUCKS = {
    1: 0.40*0.75,
    2: 0.80*0.75,
    3: 1.60*0.75,
    4: 3.20*0.75,
    5: 4.00*0.75
}

# Insurance & Financing rates (R per litre) by level, doubling from 0.1 up to 2.0 at level 5
INSURANCE_RATES = {
    1: 0.10,
    2: 0.20,
    3: 0.40,
    4: 0.80,
    5: 2.00
}
FINANCING_RATES = {
    1: 0.10,
    2: 0.20,
    3: 0.40,
    4: 0.80,
    5: 2.00
}

# Maximum monthly fuel spend for eBucks calculation
MONTHLY_FUEL_SPEND_CAP = 3000.0

# Inflation & discount rates
FUEL_INFLATION = 0.09   # 9% annual inflation
DISCOUNT_RATE = 0.1095    # 10.95% discount rate (for PV)
YEARS = 5               # Projection period

# Carbon tax rates per tonne CO₂ for each year (example rates)
CARBON_TAX = {
  2025: 236,
  2026: 308,
  2027: 347,
  2028: 390, # Extended for longer loan terms
  2029: 440,
  2030: 495,
  2031: 495,
  2032: 495
}

CO2_PER_LITRE = 2.35  # kg CO₂ per litre

# EV charging assumptions:
EV_CONSUMPTION = 0.189  # kWh per km (assumed)
STANDARD_ESKOM_RATE = 3.7     # ZAR per kWh
PREMIUM_ESKOM_RATE = 7.0      # ZAR per kWh for premium charging (10% of charging)
# Combined rate: 90% standard + 10% premium
ESKOM_RATE = (STANDARD_ESKOM_RATE * 0.9) + (PREMIUM_ESKOM_RATE * 0.1)

# CO2 emission factors
CO2_GRID = 0.9   # 0.9 kg CO2 per kWh for grid electricity
CO2_SOLAR = 0.09  # 0.09 kg CO2 per kWh for solar (not zero)

###############################################################################
# Helper Functions
###############################################################################
def present_value_of_growing_annuity(cash_flow, growth_rate, discount_rate, periods):
    """Calculates the present value of a growing annuity."""
    if abs(growth_rate - discount_rate) < 1e-9:
        return cash_flow * periods / ((1 + discount_rate) ** periods)
    else:
        return cash_flow * (((1 + growth_rate) ** periods - (1 + discount_rate) ** periods) / (growth_rate - discount_rate)) / ((1 + discount_rate) ** periods)

def present_value(cash_flow, discount_rate, year_index):
    """Discount a single cash flow from a future year to present value."""
    return cash_flow / ((1 + discount_rate) ** year_index)

def calculate_monthly_co2(distance, fuel_type):
    """Calculate monthly CO2 emissions for a given distance and fuel type."""
    consumption_rate = FUEL_CONSUMPTION.get(fuel_type, 9.0)
    monthly_litres = (consumption_rate * distance) / 100.0
    monthly_co2 = monthly_litres * CO2_PER_LITRE
    return monthly_co2

def calculate_standard_upfront_benefits(distance, fuel_type, ebucks_level=4):
    """Calculate standard 5-year upfront benefits for comparison purposes."""
    consumption_rate = FUEL_CONSUMPTION.get(fuel_type, 9.0)
    monthly_litres = (consumption_rate * distance) / 100.0
    fuel_price = FUEL_PRICES.get(fuel_type, 21.62)
    monthly_fuel_spend = monthly_litres * fuel_price
    
    # Get eBucks rates
    base_rate = BASE_EBUCKS.get(ebucks_level, 0.0)
    insurance_rate = INSURANCE_RATES.get(ebucks_level, 0.0)
    financing_rate = FINANCING_RATES.get(ebucks_level, 0.0)
    total_rate = base_rate + insurance_rate + financing_rate
    
    # Calculate eBucks
    effective_fuel_spend = min(monthly_fuel_spend, MONTHLY_FUEL_SPEND_CAP)
    qualifying_litres = effective_fuel_spend / fuel_price
    year1_ebucks = total_rate * qualifying_litres * 12
    
    # Calculate carbon tax
    annual_litres = monthly_litres * 12
    annual_tonnes_co2 = (annual_litres * CO2_PER_LITRE) / 1000.0
    carbon_tax_savings = 0.0
    current_year = 2025
    for i in range(5):  # Always 5 years for standard
        year = current_year + i
        rate = CARBON_TAX.get(year, CARBON_TAX[max(CARBON_TAX.keys())])
        annual_carbon_cost = annual_tonnes_co2 * rate
        carbon_tax_savings += present_value(annual_carbon_cost, DISCOUNT_RATE, i+1)
    
    # Calculate PV of eBucks
    pv_ebucks = present_value_of_growing_annuity(year1_ebucks, FUEL_INFLATION, DISCOUNT_RATE, 5)
    upfront_savings = pv_ebucks + carbon_tax_savings
    
    return {
        "presentValueEbucks": round(pv_ebucks, 2),
        "carbonTaxSavings": round(carbon_tax_savings, 2),
        "upfrontSavings": round(upfront_savings, 2)
    }

###############################################################################
# Routes
###############################################################################
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/calculate", methods=["POST", "OPTIONS"])
def calculate():
    response_headers = {
        "Access-Control-Allow-Origin": request.headers.get("Origin", "http://localhost:5173"),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true"
    }
    
    if request.method == "OPTIONS":
        return "", 200, response_headers
        
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "error": "No data provided",
                "presentValueEbucks": 0,
                "carbonTaxSavings": 0,
                "fuelSpendSavings": 0,
                "upfrontSavings": 0,
                "totalSavings": 0,
                "standardUpfrontBenefits": {
                    "presentValueEbucks": 0,
                    "carbonTaxSavings": 0,
                    "upfrontSavings": 0
                },
                "co2Emissions": {
                    "ice": 0,
                    "ev": 0,
                    "monthlySavings": 0,
                    "yearlySavings": 0
                }
            }), 400, response_headers

        # Validate required fields
        required_fields = ["ebucksLevel", "fuelType", "distance", "hasInsurance", "hasFinancing", "hasSolar"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return jsonify({
                "error": f"Missing required fields: {', '.join(missing_fields)}",
                "presentValueEbucks": 0,
                "carbonTaxSavings": 0,
                "fuelSpendSavings": 0,
                "upfrontSavings": 0,
                "totalSavings": 0,
                "standardUpfrontBenefits": {
                    "presentValueEbucks": 0,
                    "carbonTaxSavings": 0,
                    "upfrontSavings": 0
                },
                "co2Emissions": {
                    "ice": 0,
                    "ev": 0,
                    "monthlySavings": 0,
                    "yearlySavings": 0
                }
            }), 400, response_headers

        # --- Parse Inputs ---
        level = int(data["ebucksLevel"])
        fuel_type = data["fuelType"]
        distance_monthly = float(data["distance"])  # km per month
        has_insurance = data["hasInsurance"]
        has_financing = data["hasFinancing"]
        has_solar = data["hasSolar"]
        has_no_bank = data.get("hasNoBank", False)
        loan_term_years = data.get("loanTermYears", YEARS)

        # Validate fuel type
        if fuel_type not in FUEL_PRICES:
            return jsonify({
                "error": f"Invalid fuel type: {fuel_type}",
                "presentValueEbucks": 0,
                "carbonTaxSavings": 0,
                "fuelSpendSavings": 0,
                "upfrontSavings": 0,
                "totalSavings": 0,
                "standardUpfrontBenefits": {
                    "presentValueEbucks": 0,
                    "carbonTaxSavings": 0,
                    "upfrontSavings": 0
                },
                "co2Emissions": {
                    "ice": 0,
                    "ev": 0,
                    "monthlySavings": 0,
                    "yearlySavings": 0
                }
            }), 400, response_headers

        # --- 1. ICE Fuel Consumption & Costs ---
        consumption_rate = FUEL_CONSUMPTION.get(fuel_type, 9.0)  # litres per 100 km
        monthly_litres = (consumption_rate * distance_monthly) / 100.0
        fuel_price = FUEL_PRICES.get(fuel_type, 21.62)
        monthly_fuel_spend = monthly_litres * fuel_price
        
        # Annual fuel cost for ICE over loan term, applying inflation & discounting
        year1_fuel_cost = monthly_fuel_spend * 12
        pv_fuel_cost = 0.0
        for i in range(loan_term_years):
            cost_year = year1_fuel_cost * ((1 + FUEL_INFLATION) ** i)
            pv_fuel_cost += present_value(cost_year, DISCOUNT_RATE, i+1)

        # --- 2. EV Charging Costs ---
        annual_ev_cost = distance_monthly * 12 * EV_CONSUMPTION * ESKOM_RATE
        # Calculate present value of EV costs
        if has_solar:
            # With solar, charging cost is 1/10 of normal instead of zero
            solar_ev_cost = annual_ev_cost * 0.1  # 10% of normal cost
            pv_ev_cost = sum(present_value(solar_ev_cost, DISCOUNT_RATE, i+1) for i in range(loan_term_years))
        else:
            pv_ev_cost = sum(present_value(annual_ev_cost, DISCOUNT_RATE, i+1) for i in range(loan_term_years))

        # Fuel Spend Savings: Full fuel cost saved by switching to EV
        fuel_spend_savings = pv_fuel_cost - pv_ev_cost

        # --- 3. eBucks Calculation ---
        base_rate = 0.0
        insurance_rate = 0.0
        financing_rate = 0.0
        
        # Only apply banking benefits if hasNoBank is false
        if not has_no_bank:
            base_rate = BASE_EBUCKS.get(level, 0.0)
            insurance_rate = INSURANCE_RATES.get(level, 0.0) if has_insurance else 0.0
            financing_rate = FINANCING_RATES.get(level, 0.0) if has_financing else 0.0
        
        total_rate = base_rate + insurance_rate + financing_rate

        # Cap the fuel spend at R3000 for eBucks calculation
        effective_fuel_spend = min(monthly_fuel_spend, MONTHLY_FUEL_SPEND_CAP)
        qualifying_litres = effective_fuel_spend / fuel_price
        year1_ebucks = total_rate * qualifying_litres * 12
        # Always use 5 years for upfront benefits calculation
        pv_ebucks = present_value_of_growing_annuity(year1_ebucks, FUEL_INFLATION, DISCOUNT_RATE, 5)

        # --- 4. Carbon Tax Savings ---
        carbon_tax_savings = 0.0
        if not has_no_bank:
            annual_litres = monthly_litres * 12
            annual_tonnes_co2 = (annual_litres * CO2_PER_LITRE) / 1000.0
            current_year = 2025
            for i in range(5):  # Always 5 years for carbon tax savings
                year = current_year + i
                rate = CARBON_TAX.get(year, CARBON_TAX[max(CARBON_TAX.keys())])
                annual_carbon_cost = annual_tonnes_co2 * rate
                carbon_tax_savings += present_value(annual_carbon_cost, DISCOUNT_RATE, i+1)

        # --- 5. Calculate CO2 emissions ---
        ice_monthly_emissions = calculate_monthly_co2(distance_monthly, fuel_type)
        
        # EV emissions calculation - CRITICAL FIX
        # Always use CO2_SOLAR (0.09) for solar and CO2_GRID (0.9) for grid electricity
        if has_solar:
            ev_monthly_emissions = distance_monthly * EV_CONSUMPTION * CO2_SOLAR
            print(f"Solar EV emissions: {ev_monthly_emissions} kg CO2/month")
        else:
            ev_monthly_emissions = distance_monthly * EV_CONSUMPTION * CO2_GRID
            print(f"Grid EV emissions: {ev_monthly_emissions} kg CO2/month")
            
        monthly_co2_savings = ice_monthly_emissions - ev_monthly_emissions
        yearly_co2_savings = monthly_co2_savings * 12
        
        print(f"Monthly CO2 savings: {monthly_co2_savings} kg")

        # --- 6. Breakdown of Savings ---
        # Upfront Savings = PV eBucks + CO₂ emissions savings (from carbon tax)
        upfront_savings = pv_ebucks + carbon_tax_savings

        # Calculate standard upfront benefits for comparison (level 4, 5 years)
        standard_upfront_benefits = calculate_standard_upfront_benefits(distance_monthly, fuel_type)

        # Loan Term Savings = Fuel Spend Savings (i.e. petrol cost avoided)
        loan_term_savings = fuel_spend_savings

        total_savings = upfront_savings + loan_term_savings

        return jsonify({
            "presentValueEbucks": round(pv_ebucks, 2),
            "carbonTaxSavings": round(carbon_tax_savings, 2),
            "fuelSpendSavings": round(loan_term_savings, 2),
            "upfrontSavings": round(upfront_savings, 2),
            "totalSavings": round(total_savings, 2),
            "standardUpfrontBenefits": standard_upfront_benefits,
            "co2Emissions": {
                "ice": round(ice_monthly_emissions, 2),
                "ev": round(ev_monthly_emissions, 2),
                "monthlySavings": round(monthly_co2_savings, 2),
                "yearlySavings": round(yearly_co2_savings, 2)
            }
        }), 200, response_headers

    except ValueError as e:
        return jsonify({
            "error": f"Invalid input value: {str(e)}",
            "presentValueEbucks": 0,
            "carbonTaxSavings": 0,
            "fuelSpendSavings": 0,
            "upfrontSavings": 0,
            "totalSavings": 0,
            "standardUpfrontBenefits": {
                "presentValueEbucks": 0,
                "carbonTaxSavings": 0,
                "upfrontSavings": 0
            },
            "co2Emissions": {
                "ice": 0,
                "ev": 0,
                "monthlySavings": 0,
                "yearlySavings": 0
            }
        }), 400, response_headers
    except Exception as e:
        return jsonify({
            "error": f"An error occurred: {str(e)}",
            "presentValueEbucks": 0,
            "carbonTaxSavings": 0,
            "fuelSpendSavings": 0,
            "upfrontSavings": 0,
            "totalSavings": 0,
            "standardUpfrontBenefits": {
                "presentValueEbucks": 0,
                "carbonTaxSavings": 0,
                "upfrontSavings": 0
            },
            "co2Emissions": {
                "ice": 0,
                "ev": 0,
                "monthlySavings": 0,
                "yearlySavings": 0
            }
        }), 500, response_headers

if __name__ == "__main__":
    app.run(debug=True)