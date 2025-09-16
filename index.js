require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");

const stripe = require('stripe')(process.env.STRIPE_PAYMENT_GATEWAY_KEY);
console.log(stripe);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// firebase sdk
const serviceAccount = require("./firebase-admin-key.json");



admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


app.get('/', (req, res) => {
    res.send('Server is Ready');
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.fxoxvox.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db('usersDB').collection('users');
        const productsCollection = client.db('productsDB').collection('products');
        const productCategoryCollection = client.db('productsDB').collection('productCategories');
        const adsCollection = client.db('adsDB').collection('ads');
        const cartsCollection = client.db('ordersDB').collection('carts');
        const paymentsCollection = client.db('ordersDB').collection('payments');

        // custom middlewares
        const verifyFBToken = async (req, res, next) => {
            // console.log('header in middleware', req.headers);
            const authHeader = req.headers.authorization;

            if (!authHeader) {
                console.log(authHeader);
                return res.status(401).send({message: 'Unauthorized Access'});
            }
            
            const token = authHeader.split(' ')[1];
            
            if (!token) {
                return res.status(401).send({message: 'Unauthorized Access'});
            }

            // verify token 
            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.decoded = decoded;
                next();
            } 
            catch (error) {
                return res.status(403).send({message: 'Forbidden Access.'});
            }
        }

        // users related apis
        app.get('/users', verifyFBToken, async (req, res) => {

            console.log(req.headers);

            const {email} = req.query;
            console.log(email);

            let query = {};

            if (email) {
                query = {email: email};
            }

            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })

        // get a user 
        app.get('/user/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = usersCollection.findOne(query);
            res.send(result);
        })

        // get user role by email
        app.get('/users/:email/role', async (req, res) => {
            try {
                const email = req.params.email;

                if (!email) {
                    return res.status(400).send({message: 'Email is required'})
                }

                const user = await usersCollection.findOne({email});

                if (!user) {
                    return res.status(404).send({message: 'User not found'});
                }

                res.send({role: user.role || user})
            }
            catch (error) {
                console.error('Error getting user role.', error);
                res.status(500).send({message: 'Failed to get role'});
            }
        })

        // insert a user 
        app.post('/users', async (req, res) => {
            try {
                const email = req.body.email;
                const userExists = await usersCollection.findOne({email});
                if (userExists) {
                    return res.status(200).send({message: 'User already exists.', inserted: false})
                }
                const user = req.body;
                const result = await usersCollection.insertOne(user);
                res.status(201).send(result);
            } catch (error) {
                console.error('Error inserting user.', error);
                res.status(500).send({message: 'Failed to insert the user.' });
            }
        })

        // change a user role 
        app.patch('/users/:email/role', async (req, res) => {
            const email = req.params.email;

            const query = {email: email};

            const {role} = req.body;

            const updatedDoc = {
                $set: {
                    role
                }
            }

            const result = await usersCollection.updateOne(query, updatedDoc);

            res.send(result);
        })

        // product related apis

        // get products 
        app.get('/products', async (req, res) => {

            const {email} = req.query;

            let query = {};
        
            if (email) {
                query = {email: email};
            }

            const options = {sort: {date: -1}};

            const products = await productsCollection.find(query, options).toArray();
            res.send(products);
        })

        // get a product
        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const product = await productsCollection.findOne(query);
            res.send(product);
        })

        // post a product
        app.post('/products', async (req, res) => {
            try {
                const newProduct = req.body;
                const result = await productsCollection.insertOne(newProduct);
                res.status(201).send(result);
            } catch (error) {
                console.error('Error Inserting product', error);
                res.status(500).send({message: 'Failed to create product'});
            }
        })

        app.patch('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const updatedProduct = req.body;
            const updatedDoc = {
                $set: {...updatedProduct}
            }
            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        // patch a product 
        app.patch('/products/:id/adStatus', async (req, res) => {

            const id = req.params.id;
            const {adStatus} = req.body;
            const query = {_id: new ObjectId(id)};
            const updatedDoc = {
                $set: {
                    adStatus,
                }
            }

            const result = await productsCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

        app.delete('/products/:id', async(req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await productsCollection.deleteOne(query);
            res.send(result);
        })

        // product categories
        app.get('/productCategories', async (req, res) => {
            const query = {parentId: '68b47bf1f191cd70bd0a0ebb'}
            const result = await productCategoryCollection.find(query).toArray();
            res.send(result);
        })

        // order related apis
        
        // get carts
        app.get('/carts', async (req, res) => {
            
            const email = req.query.email;
            
            let query = {}
            
            if (email) {
                query =  {email: email};
            }

            const options = {sort: {_id: -1}}
            
            const carts = await cartsCollection.find(query, options).toArray();
            res.send(carts);
        })

        // get a item in the cart
        app.get('/carts/:id', async (req, res) => {
            const id = req.params.id;

            const query = {_id : new ObjectId(id)};

            const result = await cartsCollection.findOne(query);
            res.send(result);
        })
        

        // post a item to cart
        app.post('/carts', async (req, res) => {
            const newCartItem = req.body;
            const result = await cartsCollection.insertOne(newCartItem);
            res.send(result);
        })

        // delete a item from cart
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await cartsCollection.deleteOne(query);
            res.send(result);
        })

        // payment api
        app.get('/payments', async (req, res) => {
            try {
                const userEmail = req.query.email;
                const query = userEmail ? {email: userEmail} : {};
                const options = {sort: {paid_at: -1}}; // latest first

                const payments = await paymentsCollection.find(query, options).toArray();
                res.send(payments);

            } catch (error) {
                console.error('Error fetching payment history: ', error);
                res.status(500).send({message: "Failed to get payment."})
            }
        })

        // record payment and update parcel status
        app.post('/payments', async (req, res) => {
            try {
                const {cartId, email, amount, paymentMethod, transactionId} = req.body;

                // 1. update parcels payment status
                const updateResult = await cartsCollection.updateOne({_id: new ObjectId(cartId)}, 
                { 
                    $set : {
                    payment_status: 'paid'
                    }
                }
            );

            if (updateResult.modifiedCount === 0) {
                return res.status(400).send({message: "Parcel not found or already paid."})
            }

            // 2. Insert payment record
            const paymentDoc = {
                cartId,
                email, 
                amount,
                paymentMethod, 
                transactionId,
                paid_at_string: new Date().toISOString(),
                paid_at: new Date(),
            };

            const paymentResult = await paymentsCollection.insertOne(paymentDoc);

            res.status(201).send({
                message: 'Payment recorded and parcel marked as paid',
                insertedId: paymentResult.insertedId,
            });

            } catch (error) {
                console.error('Error posting payment: ', error);
                res.status(500).send({message: "Failed to post payment."})
            }
        })

        // create payment intent
        app.post('/create-payment-intent', async (req, res) => {

            const amountInCents = req.body.amountInCents;
            console.log(amountInCents);

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents,  // amonut in cents
                    currency: 'usd',
                    payment_method_types: ['card'],
                })

                res.json({clientSecret: paymentIntent.client_secret });
            } catch (error) {
                res.status(500).json({error: error.message})
            }
        })


        // advertise related api

        // get ads
        app.get('/advertisements', async (req, res) => {

            const {email} = req.query;

            let query = {};

            if (email) {
                query = {email: email}
            }

            const result = await adsCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/advertisements/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await adsCollection.findOne(query);
            res.send(result);
        })
        
        // post a ad 
        app.post('/advertisements', async (req, res) => {
            const newAd = req.body;
            const result = await adsCollection.insertOne(newAd);
            res.send(result);
        })

        app.patch('/advertisements/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const updatedAd = req.body;
            const updatedDoc = {
                $set: {...updatedAd},
            }
            const result = await adsCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        // patch a ad
        app.patch('/advertisements/:id/status', async (req, res) => {
            const id = req.params.id;
            const {status, email} = req.body;
            const query = {_id: new ObjectId(id)};
            const updatedDoc = {
                    $set: {
                        status,
                    }
                }
            const result = await adsCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        app.delete('/advertisements/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = adsCollection.deleteOne(query);
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`App is listening to port: ${port}`);
})