#!/usr/bin/env python3
"""
generate_data.py - Synthetic e-commerce dataset generator for BCG701 CCA #28.

Produces three JSON-array files (import with mongoimport --jsonArray):
    customers.json  (500 docs)
    products.json   (100 docs)
    orders.json     (2000 docs)

A fixed random seed makes the dataset reproducible, so your results match
what you show in the report and during the viva.

Usage:  python3 generate_data.py
"""
import json
import random
from datetime import datetime, timedelta

random.seed(42)

N_CUSTOMERS = 500
N_PRODUCTS = 100
N_ORDERS = 2000

CITIES = [
    ("Bengaluru", "Karnataka"), ("Mumbai", "Maharashtra"), ("Delhi", "Delhi"),
    ("Chennai", "Tamil Nadu"), ("Hyderabad", "Telangana"), ("Pune", "Maharashtra"),
    ("Kolkata", "West Bengal"), ("Ahmedabad", "Gujarat"), ("Jaipur", "Rajasthan"),
    ("Kochi", "Kerala"),
]
FIRST = ["Aarav", "Vivaan", "Aditya", "Arjun", "Rohan", "Karan", "Ishaan", "Rahul",
         "Ananya", "Diya", "Priya", "Sneha", "Kavya", "Meera", "Neha", "Pooja",
         "Riya", "Sanya", "Isha", "Aisha"]
LAST = ["Sharma", "Verma", "Gupta", "Reddy", "Nair", "Iyer", "Patel", "Singh",
        "Kumar", "Das", "Joshi", "Mehta", "Rao", "Agarwal", "Bose"]

CATEGORIES = {
    "Electronics": ["Wireless Earbuds", "Bluetooth Speaker", "Smartwatch", "Power Bank",
                    "USB-C Cable", "Webcam", "Keyboard", "Mouse", "Monitor", "Tablet"],
    "Fashion": ["Cotton T-Shirt", "Denim Jeans", "Running Shoes", "Hoodie", "Backpack",
                "Sunglasses", "Wrist Watch", "Leather Belt", "Kurta", "Sneakers"],
    "Home & Kitchen": ["Mixer Grinder", "Air Fryer", "Water Bottle", "Cookware Set",
                       "Bedsheet", "Table Lamp", "Vacuum Cleaner", "Pressure Cooker",
                       "Dinner Set", "Storage Box"],
    "Books": ["Python Programming", "Data Structures", "Big Data Basics", "Novel Collection",
              "Self Help Guide", "Math Workbook", "History Atlas", "Cookbook",
              "Science Encyclopedia", "Comics Pack"],
    "Sports": ["Cricket Bat", "Football", "Yoga Mat", "Dumbbell Set", "Badminton Racket",
               "Skipping Rope", "Gym Gloves", "Cycling Helmet", "Tennis Ball Pack",
               "Resistance Bands"],
}
PRICE_RANGE = {"Electronics": (499, 24999), "Fashion": (299, 3999),
               "Home & Kitchen": (399, 8999), "Books": (149, 999), "Sports": (199, 4999)}
STATUSES = ["Placed", "Shipped", "Delivered", "Delivered", "Delivered", "Cancelled"]
PAYMENTS = ["UPI", "Credit Card", "Debit Card", "Net Banking", "Cash on Delivery"]


def iso(dt):
    # Extended JSON date so mongoimport stores real Date objects
    return {"$date": dt.strftime("%Y-%m-%dT%H:%M:%SZ")}


def make_customers():
    out = []
    for i in range(1, N_CUSTOMERS + 1):
        fn, ln = random.choice(FIRST), random.choice(LAST)
        city, state = random.choice(CITIES)
        doc = {
            "_id": f"C{i:04d}",
            "name": f"{fn} {ln}",
            "email": f"{fn.lower()}.{ln.lower()}{i}@example.com",
            "age": random.randint(18, 65),
            "gender": random.choice(["Male", "Female"]),
            "address": {"city": city, "state": state, "pincode": str(random.randint(500000, 700000))},
            "registeredOn": iso(datetime(2023, 1, 1) + timedelta(days=random.randint(0, 900))),
            "loyaltyTier": random.choices(["Bronze", "Silver", "Gold"], weights=[60, 30, 10])[0],
        }
        # Deliberately leave ~8% without a phone to demonstrate missing-field handling
        if random.random() > 0.08:
            doc["phone"] = "9" + "".join(str(random.randint(0, 9)) for _ in range(9))
        out.append(doc)
    return out


def make_products():
    out, n = [], 1
    for cat, names in CATEGORIES.items():
        lo, hi = PRICE_RANGE[cat]
        for nm in names:
            for variant in ("Basic", "Pro"):
                if n > N_PRODUCTS:
                    break
                price = round(random.uniform(lo, hi) * (1.4 if variant == "Pro" else 1), 2)
                out.append({
                    "_id": f"P{n:03d}",
                    "name": f"{nm} {variant}",
                    "category": cat,
                    "brand": random.choice(["Zenith", "Orbit", "Nova", "Apex", "Bliss", "Vertex"]),
                    "price": price,
                    "stock": random.randint(0, 300),
                    "rating": round(random.uniform(2.5, 5.0), 1),
                    "tags": random.sample(["new", "bestseller", "eco", "premium", "budget", "gift"], 2),
                    "description": f"{variant} edition of {nm.lower()} in the {cat.lower()} category",
                })
                n += 1
    return out[:N_PRODUCTS]


def make_orders(customers, products):
    out = []
    start = datetime(2025, 1, 1)
    for i in range(1, N_ORDERS + 1):
        cust = random.choice(customers)
        items = []
        for p in random.sample(products, random.choices([1, 2, 3, 4], weights=[50, 30, 15, 5])[0]):
            qty = random.randint(1, 4)
            # Embed a snapshot of price/name so historical orders stay accurate
            items.append({"productId": p["_id"], "name": p["name"], "category": p["category"],
                          "unitPrice": p["price"], "quantity": qty})
        total = round(sum(it["unitPrice"] * it["quantity"] for it in items), 2)
        out.append({
            "_id": f"O{i:05d}",
            "customerId": cust["_id"],
            "orderDate": iso(start + timedelta(days=random.randint(0, 540), hours=random.randint(0, 23),
                                               minutes=random.randint(0, 59))),
            "items": items,
            "totalAmount": total,
            "status": random.choice(STATUSES),
            "paymentMethod": random.choice(PAYMENTS),
            "shippingCity": cust["address"]["city"],
        })
    return out


def dump(name, docs):
    with open(name, "w", encoding="utf-8") as f:
        json.dump(docs, f, indent=1)
    print(f"{name}: {len(docs)} documents")


if __name__ == "__main__":
    customers = make_customers()
    products = make_products()
    orders = make_orders(customers, products)
    dump("customers.json", customers)
    dump("products.json", products)
    dump("orders.json", orders)
