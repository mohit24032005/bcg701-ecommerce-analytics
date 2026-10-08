// ============================================================================
// BCG701 CCA #28 - E-Commerce Analytics System (MongoDB)
// Run:   mongosh --file ecommerce_analytics.js
//   or paste section by section into mongosh to capture screenshots.
// Prerequisite: customers.json, products.json, orders.json imported (see README).
// ============================================================================

use("ecommerce_db");

// ---------------------------------------------------------------------------
// SECTION 0: Verify import
// ---------------------------------------------------------------------------
print("\n=== 0. Collection counts ===");
printjson({
  customers: db.customers.countDocuments(),
  products: db.products.countDocuments(),
  orders: db.orders.countDocuments(),
});

// ---------------------------------------------------------------------------
// SECTION 1: Schema design notes + indexes
// Design: customers and products are separate collections (referenced);
// order line items are EMBEDDED in orders with a price snapshot, because an
// order is always read as a whole and historical prices must not change.
// ---------------------------------------------------------------------------
print("\n=== 1. Indexes ===");
db.customers.createIndex({ email: 1 }, { unique: true });
db.customers.createIndex({ "address.city": 1 });
db.products.createIndex({ category: 1, price: 1 });
db.products.createIndex({ name: "text", description: "text" });
db.orders.createIndex({ customerId: 1, orderDate: -1 });
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ "items.productId": 1 });
printjson(db.orders.getIndexes().map(i => i.name));

// ---------------------------------------------------------------------------
// SECTION 2: Customer management (CRUD)
// ---------------------------------------------------------------------------
print("\n=== 2. Customer management ===");

// CREATE
db.customers.insertOne({
  _id: "C9001", name: "Test Student", email: "test.student@example.com", age: 21,
  gender: "Male", address: { city: "Bengaluru", state: "Karnataka", pincode: "560001" },
  registeredOn: new Date(), loyaltyTier: "Bronze", phone: "9876543210",
});

// READ
printjson(db.customers.findOne({ _id: "C9001" }));

// UPDATE: customer moves city and is upgraded
db.customers.updateOne(
  { _id: "C9001" },
  { $set: { "address.city": "Mysuru", loyaltyTier: "Silver" } }
);
printjson(db.customers.findOne({ _id: "C9001" }, { name: 1, address: 1, loyaltyTier: 1 }));

// UPDATE many: customers with no phone get a flag for follow-up
db.customers.updateMany(
  { phone: { $exists: false } },
  { $set: { needsContactUpdate: true } }
);
print("Customers flagged for contact update: " +
  db.customers.countDocuments({ needsContactUpdate: true }));

// DELETE
db.customers.deleteOne({ _id: "C9001" });
print("Test customer remaining: " + db.customers.countDocuments({ _id: "C9001" }));

// Customer lookups by location / age / tier
print("\nGold customers in Mumbai:");
printjson(db.customers.find(
  { "address.city": "Mumbai", loyaltyTier: "Gold" }, { name: 1, age: 1 }).toArray());

print("Customers aged 25-30 (count): " +
  db.customers.countDocuments({ age: { $gte: 25, $lte: 30 } }));

// ---------------------------------------------------------------------------
// SECTION 3: Product search
// ---------------------------------------------------------------------------
print("\n=== 3. Product search ===");

print("a) Text search for 'watch':");
printjson(db.products.find(
  { $text: { $search: "watch" } },
  { name: 1, price: 1, score: { $meta: "textScore" } }
).sort({ score: { $meta: "textScore" } }).limit(5).toArray());

print("b) Electronics under Rs.5000 with rating >= 4.0, cheapest first:");
printjson(db.products.find(
  { category: "Electronics", price: { $lt: 5000 }, rating: { $gte: 4.0 } },
  { name: 1, price: 1, rating: 1, _id: 0 }
).sort({ price: 1 }).limit(5).toArray());

print("c) Tagged 'bestseller' AND in stock:");
printjson(db.products.find(
  { tags: "bestseller", stock: { $gt: 0 } },
  { name: 1, stock: 1, _id: 0 }
).limit(5).toArray());

print("d) Pagination (page 2, 10 per page, sorted by name):");
const page = 2, pageSize = 10;
printjson(db.products.find({}, { name: 1, price: 1, _id: 0 })
  .sort({ name: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray());

print("e) Low-stock alert (stock < 10):");
print("   count = " + db.products.countDocuments({ stock: { $lt: 10 } }));

print("f) Query plan check (index used?):");
const plan = db.products.find({ category: "Electronics", price: { $lt: 5000 } })
  .explain("executionStats");
printjson({
  stage: plan.queryPlanner.winningPlan.stage || plan.queryPlanner.winningPlan.inputStage.stage,
  docsExamined: plan.executionStats.totalDocsExamined,
  returned: plan.executionStats.nReturned,
});

// ---------------------------------------------------------------------------
// SECTION 4: Orders
// ---------------------------------------------------------------------------
print("\n=== 4. Orders ===");

// Place a new order (price snapshot copied from the product)
const prod = db.products.findOne({ _id: "P001" });
db.orders.insertOne({
  _id: "O99999", customerId: "C0001", orderDate: new Date(),
  items: [{ productId: prod._id, name: prod.name, category: prod.category,
            unitPrice: prod.price, quantity: 2 }],
  totalAmount: Math.round(prod.price * 2 * 100) / 100,
  status: "Placed", paymentMethod: "UPI", shippingCity: "Bengaluru",
});
db.products.updateOne({ _id: "P001" }, { $inc: { stock: -2 } });
printjson(db.orders.findOne({ _id: "O99999" }));

// Status workflow
db.orders.updateOne({ _id: "O99999" }, { $set: { status: "Shipped" } });
db.orders.updateOne({ _id: "O99999" }, { $set: { status: "Delivered" } });
print("Order status now: " + db.orders.findOne({ _id: "O99999" }).status);

// Join orders with customers using $lookup
print("Order with customer details ($lookup):");
printjson(db.orders.aggregate([
  { $match: { _id: "O99999" } },
  { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" } },
  { $unwind: "$customer" },
  { $project: { totalAmount: 1, status: 1, "customer.name": 1, "customer.email": 1 } },
]).toArray());

// Cancel and clean up the demo order
db.orders.deleteOne({ _id: "O99999" });
db.products.updateOne({ _id: "P001" }, { $inc: { stock: 2 } });

print("Orders by status:");
printjson(db.orders.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]).toArray());

// ---------------------------------------------------------------------------
// SECTION 5: Sales analysis (aggregation pipelines)
// Revenue counts only non-cancelled orders.
// ---------------------------------------------------------------------------
print("\n=== 5. Sales analysis ===");
const valid = { status: { $ne: "Cancelled" } };

print("5.1 Overall KPIs:");
printjson(db.orders.aggregate([
  { $match: valid },
  { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" },
              orders: { $sum: 1 }, avgOrderValue: { $avg: "$totalAmount" },
              maxOrder: { $max: "$totalAmount" } } },
  { $project: { _id: 0, orders: 1, maxOrder: 1,
                totalRevenue: { $round: ["$totalRevenue", 2] },
                avgOrderValue: { $round: ["$avgOrderValue", 2] } } },
]).toArray());

print("5.2 Revenue by category:");
printjson(db.orders.aggregate([
  { $match: valid }, { $unwind: "$items" },
  { $group: { _id: "$items.category",
              revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.quantity"] } },
              unitsSold: { $sum: "$items.quantity" } } },
  { $project: { revenue: { $round: ["$revenue", 2] }, unitsSold: 1 } },
  { $sort: { revenue: -1 } },
]).toArray());

print("5.3 Top 5 products by units sold:");
printjson(db.orders.aggregate([
  { $match: valid }, { $unwind: "$items" },
  { $group: { _id: "$items.name", unitsSold: { $sum: "$items.quantity" },
              revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.quantity"] } } } },
  { $sort: { unitsSold: -1 } }, { $limit: 5 },
  { $project: { unitsSold: 1, revenue: { $round: ["$revenue", 2] } } },
]).toArray());

print("5.4 Monthly sales trend:");
printjson(db.orders.aggregate([
  { $match: valid },
  { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$orderDate" } },
              revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
  { $project: { orders: 1, revenue: { $round: ["$revenue", 2] } } },
  { $sort: { _id: 1 } },
]).toArray());

print("5.5 Top 5 customers by lifetime spend:");
printjson(db.orders.aggregate([
  { $match: valid },
  { $group: { _id: "$customerId", spend: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
  { $sort: { spend: -1 } }, { $limit: 5 },
  { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "c" } },
  { $unwind: "$c" },
  { $project: { name: "$c.name", city: "$c.address.city", orders: 1,
                spend: { $round: ["$spend", 2] } } },
]).toArray());

print("5.6 Revenue by shipping city:");
printjson(db.orders.aggregate([
  { $match: valid },
  { $group: { _id: "$shippingCity", revenue: { $sum: "$totalAmount" } } },
  { $project: { revenue: { $round: ["$revenue", 2] } } },
  { $sort: { revenue: -1 } },
]).toArray());

print("5.7 Payment method share:");
printjson(db.orders.aggregate([
  { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
]).toArray());

print("5.8 Cancellation rate (%):");
printjson(db.orders.aggregate([
  { $group: { _id: null, total: { $sum: 1 },
              cancelled: { $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 1, 0] } } } },
  { $project: { _id: 0, total: 1, cancelled: 1,
                ratePct: { $round: [{ $multiply: [{ $divide: ["$cancelled", "$total"] }, 100] }, 2] } } },
]).toArray());

print("5.9 Customers who never ordered:");
printjson(db.customers.aggregate([
  { $lookup: { from: "orders", localField: "_id", foreignField: "customerId", as: "o" } },
  { $match: { o: { $size: 0 } } },
  { $count: "customersWithNoOrders" },
]).toArray());

print("5.10 Average rating per category:");
printjson(db.products.aggregate([
  { $group: { _id: "$category", avgRating: { $avg: "$rating" }, products: { $sum: 1 } } },
  { $project: { products: 1, avgRating: { $round: ["$avgRating", 2] } } },
  { $sort: { avgRating: -1 } },
]).toArray());

print("\n=== Done ===");
