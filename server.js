const express = require("express");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = "champions-sport-house-secret";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const uploadDir = path.join(__dirname, "public", "images");
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- AUTH ---
app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { name, email, password: hashedPassword, role: "CUSTOMER" } });
    res.json({ message: "Account created" });
  } catch (error) { res.status(400).json({ error: "Email already exists." }); }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "CUSTOMER") return res.status(400).json({ error: "Customer account not found" });
  const validPass = await bcrypt.compare(password, user.password);
  if (!validPass) return res.status(400).json({ error: "Invalid password" });
  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, name: user.name, message: "Login successful" });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(400).json({ error: "User not found" });
  const validPass = await bcrypt.compare(password, user.password);
  if (!validPass) return res.status(400).json({ error: "Invalid password" });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, message: "Login successful" });
});

// --- PUBLIC DATA ---
app.get("/api/products", async (req, res) => {
  const products = await prisma.product.findMany({ include: { category: true } });
  res.json(products);
});

app.get("/api/categories", async (req, res) => {
  const categories = await prisma.category.findMany();
  res.json(categories);
});

// --- CONTACT MESSAGES ---
app.post("/api/contact", async (req, res) => {
  try {
    const { name, contact, message } = req.body;
    await prisma.contactMessage.create({ data: { name, contact, message } });
    res.json({ message: "Message sent successfully!" });
  } catch (error) { res.status(400).json({ error: "Failed to send message." }); }
});

app.get("/api/admin/messages", async (req, res) => {
  try {
    const messages = await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(messages);
  } catch (error) { res.status(500).json({ error: "Failed to fetch messages." }); }
});

// --- CHECKOUT ---
app.post("/api/checkout", async (req, res) => {
  const { items, total } = req.body;
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Please login first" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const order = await prisma.order.create({
      data: {
        userId: decoded.userId,
        total: parseFloat(total),
        status: "PENDING",
        items: { create: items.map(item => ({ productId: item.id, quantity: item.qty, price: item.price, size: item.size, color: item.color })) }
      }
    });
    res.json({ message: "Order placed!", orderId: order.id });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// --- ADMIN PRODUCTS ---
app.post("/api/admin/products", upload.single("imageFile"), async (req, res) => {
  try {
    const { name, description, price, previousPrice, sizes, colors, categoryId, isFeatured, imageUrlText, stockStatus } = req.body;
    let imageUrl = imageUrlText || null;
    if (req.file) imageUrl = `/images/${req.file.filename}`;
    const product = await prisma.product.create({
      data: { name, description, price: parseFloat(price), previousPrice: previousPrice ? parseFloat(previousPrice) : null, imageUrl, sizes, colors, stockStatus, categoryId: parseInt(categoryId), isFeatured: isFeatured === 'true' }
    });
    res.json({ message: "Product added!", product });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put("/api/admin/products/:id", upload.single("imageFile"), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, description, price, previousPrice, sizes, colors, categoryId, isFeatured, imageUrlText, stockStatus } = req.body;
    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    let imageUrl = imageUrlText || existingProduct.imageUrl;
    if (req.file) imageUrl = `/images/${req.file.filename}`;
    const product = await prisma.product.update({
      where: { id: productId },
      data: { name, description, price: parseFloat(price), previousPrice: previousPrice ? parseFloat(previousPrice) : null, imageUrl, sizes, colors, stockStatus, categoryId: parseInt(categoryId), isFeatured: isFeatured === 'true' }
    });
    res.json({ message: "Product updated!", product });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete("/api/admin/products/:id", async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Product deleted!" });
  } catch (error) { res.status(400).json({ error: "Cannot delete product linked to an order." }); }
});

app.get("/api/admin/orders", async (req, res) => {
  const orders = await prisma.order.findMany({ include: { user: true, items: { include: { product: true } } }, orderBy: { createdAt: 'desc' } });
  res.json(orders);
});

app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));