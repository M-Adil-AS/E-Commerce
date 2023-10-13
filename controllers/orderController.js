const Order = require('../models/Order');
const Product = require('../models/Product');

const { StatusCodes } = require('http-status-codes');
const CustomError = require('../errors');
const { checkPermissions } = require('../utils');
const stripe = require('stripe')(process.env.STRIPE_KEY);

const stripeAPI = async ({ amount, currency }) => {
  const paymentIntent = await stripe.paymentIntents.create({amount, currency});
  return paymentIntent;
};

const createOrder = async (req, res) => {
  const { items: cartItems, tax, shippingFee } = req.body;

  if (!cartItems || cartItems.length < 1) {
    throw new CustomError.BadRequestError('No cart items provided');
  }
  if (!tax || !shippingFee) {
    throw new CustomError.BadRequestError(
      'Please provide tax and shipping fee'
    );
  }

  let orderItems = [];
  let subtotal = 0;

  const dbProducts = await Product.find({_id: { $in: cartItems.map(cartItem => cartItem.product) } })

  if(dbProducts.length != cartItems.length){
    let cartItemIDs = cartItems.map(cartItem => cartItem.product)
    let dbItemIDs = dbProducts.map(dbItem => String(dbItem._id))
    let notFoundItems = cartItemIDs.filter(cartItemID => !dbItemIDs.includes(cartItemID))

    throw new CustomError.NotFoundError(
      `No product with id : ${notFoundItems.join(', ')}`
    );
  }

  for(cartItem of cartItems){
    const dbItem = dbProducts.find(dbProduct => cartItem.product === String(dbProduct._id))

    const singleOrderItem = {
      amount: cartItem.amount,
      name: dbItem.name,
      price: dbItem.price,
      image: dbItem.image,
      product: cartItem.product,
    };

    orderItems = [...orderItems, singleOrderItem];
    subtotal += singleOrderItem.amount * singleOrderItem.price;
  }

  const total = tax + shippingFee + subtotal;

  const paymentIntent = await stripeAPI({
    amount: total,
    currency: 'usd',
  });

  const order = await Order.create({
    orderItems,
    total,
    subtotal,
    tax,
    shippingFee,
    clientSecret: paymentIntent.client_secret,
    user: req.user.userId,
  });

  res.status(StatusCodes.CREATED).json({ order, clientSecret: order.clientSecret });
};

const getAllOrders = async (req, res) => {
  const orders = await Order.find({});
  res.status(StatusCodes.OK).json({ orders, count: orders.length });
};

const getSingleOrder = async (req, res) => {
  const { id: orderId } = req.params;

  const order = await Order.findOne({ _id: orderId });
  if (!order) {
    throw new CustomError.NotFoundError(`No order with id : ${orderId}`);
  }

  checkPermissions(req.user, order.user);

  res.status(StatusCodes.OK).json({ order });
};

const getCurrentUserOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user.userId });
  res.status(StatusCodes.OK).json({ orders, count: orders.length });
};

const updateOrder = async (req, res) => {
  const { id: orderId } = req.params;
  const { paymentIntentId } = req.body;

  const order = await Order.findOne({ _id: orderId });
  if (!order) {
    throw new CustomError.NotFoundError(`No order with id : ${orderId}`);
  }

  checkPermissions(req.user, order.user);

  const orderItems = order.orderItems
  const dbProducts = await Product.find({_id: { $in: orderItems.map(orderItem => orderItem.product) } })
  let promises = []

  for(dbProduct of dbProducts){
    const orderItem = orderItems.find(orderItem => String(orderItem.product) === String(dbProduct._id))
    dbProduct.inventory -= orderItem.amount
    promises.push(dbProduct.save())
  }

  await Promise.all(promises)

  order.paymentIntentId = paymentIntentId;
  order.status = 'paid';
  await order.save();

  res.status(StatusCodes.OK).json({ order });
};

module.exports = {
  getAllOrders,
  getSingleOrder,
  getCurrentUserOrders,
  createOrder,
  updateOrder,
};
