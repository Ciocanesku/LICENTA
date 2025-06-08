const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const session = require('express-session');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const crypto = require('crypto'); // Pentru a genera token-uri unice
const router = express.Router();
const fetch = require('node-fetch');
const bodyParser = require('body-parser');

console.log("API_URL:", process.env.API_URL);
console.log("API Key Loaded:", process.env.HF_API_TOKEN ? "Yes" : "No");
const API_URL = process.env.API_URL;
const HF_API_TOKEN = process.env.HF_API_TOKEN;

const app = express();
const PORT = 8000;


// Configurare multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/images')); // Salvează imaginile în directorul `public/images`
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Salvează fișierul cu un nume unic
    }
});

const upload = multer({ storage });

// Configurăm transportul Nodemailer pentru Mailtrap
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'shop.ckn.off@gmail.com',  
        pass: ''   
    }
});


// Configurare baza de date MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Ciocanandrei23',
    database: 'online_shop'
});

db.connect(err => {
    if (err) throw err;
    console.log('Conectat la baza de date!');
});

// Middleware pentru sesiuni
app.use(session({
    secret: 'cheie_secreta_unica', // Cheia secretă pentru sesiuni
    resave: false,                // Nu resalvați sesiunea dacă nu se modifică
    saveUninitialized: true       // Salvați sesiuni noi chiar dacă sunt goale
}));

// Middleware pentru a seta variabila `user` în șabloane
app.use((req, res, next) => {
    res.locals.user = req.session.user || null; // Dacă utilizatorul nu e conectat, `user` va fi `null`
    next();
});

// Setăm EJS ca view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servim fișierele statice
app.use(express.static(path.join(__dirname, 'public')));

app.use('/favicon.ico', express.static(path.join(__dirname, 'public/images/favicon/favicon-32x32.png')));

app.use(express.json());

app.use(bodyParser.json()); // Permite parsarea JSON-ului în request-uri
app.use(bodyParser.urlencoded({ extended: true })); // Permite formulare URL-encoded

app.use(express.json()); // Middleware alternativ pentru parsarea JSON (poate fi folosit în locul bodyParser.json())
app.use(express.urlencoded({ extended: true })); // Parsare date URL-encoded

function isAuthenticated(req, res, next) {
    if (!req.session.user) {
        return res.status(403).send('Trebuie să te autentifici!');
    }
    next();
}

function isAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Acces interzis! Doar pentru administratori.');
    }
    next();
}

const sendOrderConfirmationEmail = async (email, orderId, cart, totalPrice, discount, finalTotal, address, paymentMethod) => {
    let orderDetails = cart.map(item => 
        `${item.quantity}x ${item.name} - ${item.price} RON (Total: ${(item.price * item.quantity).toFixed(2)} RON)`
    ).join('<br>');

    let discountText = discount > 0 
        ? `<p><strong>Reducere aplicată:</strong> -${discount}%</p>
           <p><strong>Total cu reducere:</strong> ${finalTotal.toFixed(2)} RON</p>` 
        : `<p><strong>Total:</strong> ${finalTotal.toFixed(2)} RON</p>`;

    const mailOptions = {
        from: '"CKN Shop" <shop.ckn.off@gmail.com>',
        to: email,
        subject: `Confirmare comandă #${orderId}`,
        html: `<h3>Mulțumim pentru comandă!</h3>
               <p>Comanda ta cu ID-ul <strong>${orderId}</strong> a fost înregistrată.</p>
               <p><strong>Detalii produse:</strong></p>
               <p>${orderDetails}</p>
               <p><strong>Total înainte de reducere:</strong> ${totalPrice.toFixed(2)} RON</p>
               ${discountText}
               <hr>
               <p><strong>Adresă de livrare:</strong> ${address}</p>
               <p><strong>Metodă de plată:</strong> ${paymentMethod}</p>
               <hr>
               <p>Vom reveni cu detalii despre livrare.</p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ Email de confirmare trimis cu succes către:', email);
    } catch (error) {
        console.error('⚠️ Eroare la trimiterea emailului:', error);
    }
};



const deleteExpiredPromoCodes = () => {
    const deletePromoSQL = `DELETE FROM promo_codes WHERE expires_at < NOW()`;
    const deleteUsageSQL = `
        DELETE pu FROM promo_usage pu
        JOIN promo_codes pc ON pu.promo_code = pc.code
        WHERE pc.expires_at < NOW()
    `;

    db.query(deletePromoSQL, (err, result) => {
        if (err) {
            console.error("❌ Eroare la ștergerea codurilor promo expirate:", err);
        } else {
            console.log(`🗑️ ${result.affectedRows} coduri promo expirate au fost șterse.`);
        }
    });

    db.query(deleteUsageSQL, (err, result) => {
        if (err) {
            console.error("❌ Eroare la ștergerea utilizărilor codurilor promo expirate:", err);
        } else {
            console.log(`🗑️ ${result.affectedRows} utilizări de coduri promo au fost șterse.`);
        }
    });
};


// Rulează automat această funcție o dată pe zi
setInterval(deleteExpiredPromoCodes, 24 * 60 * 60 * 1000);

app.get('/', (req, res) => {
    const sql = 'SELECT * FROM products';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Eroare la încărcarea produselor:', err);
            return res.status(500).send('Eroare la server');
        }
        res.render('index', { products: results });
    });
});


app.get('/product/:id', (req, res) => {
    const productId = req.params.id;

    // Obține produsul
    const getProductSQL = 'SELECT * FROM products WHERE id = ?';
    
    // Obține DOAR recenziile aprobate
    const getReviewsSQL = `
        SELECT r.id, r.rating, r.comment, r.created_at, u.email AS user_email 
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.product_id = ? AND r.is_approved = TRUE
        ORDER BY r.created_at DESC
    `;

    db.query(getProductSQL, [productId], (err, productResults) => {
        if (err || productResults.length === 0) {
            console.error('Eroare la obținerea produsului:', err);
            return res.status(404).send('Produsul nu a fost găsit.');
        }

        const product = productResults[0];

        db.query(getReviewsSQL, [productId], (err, reviewResults) => {
            if (err) {
                console.error('Eroare la obținerea recenziilor:', err);
                return res.status(500).send('Eroare la server.');
            }

            res.render('product', { product, reviews: reviewResults });
        });
    });
});


app.post('/admin/reviews/approve', express.json(), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Acces interzis.');
    }

    const { reviewId } = req.body;

    try {
        const sql = `UPDATE reviews SET is_approved = TRUE WHERE id = ?`;
        await db.promise().query(sql, [reviewId]);
        res.status(200).send('Recenzia a fost aprobată.');
    } catch (error) {
        console.error('❌ Eroare la aprobarea recenziei:', error);
        res.status(500).send('Eroare la aprobarea recenziei.');
    }
});
app.post('/admin/reviews/delete', express.json(), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Acces interzis.');
    }

    const { reviewId } = req.body;

    try {
        const sql = `DELETE FROM reviews WHERE id = ?`;
        await db.promise().query(sql, [reviewId]);
        res.status(200).send('Recenzia a fost ștearsă.');
    } catch (error) {
        console.error('❌ Eroare la ștergerea recenziei:', error);
        res.status(500).send('Eroare la ștergerea recenziei.');
    }
});




// Editarea unui produs și a stocului pe mărimi
app.post('/admin/products/edit', express.json(), isAuthenticated, isAdmin, (req, res) => {
    const { id, name, type, price, description, image } = req.body;

    console.log('🔹 Cerere primită pentru editare produs:', req.body);

    if (!id || !name || !type || !price || !description || !image) {
        console.log('⚠️ Eroare: Un câmp lipsește! Date primite:', req.body);
        return res.status(400).send('Toate câmpurile sunt necesare!');
    }

    const sql = 'UPDATE products SET name = ?, type = ?, price = ?, description = ?, image = ? WHERE id = ?';
    db.query(sql, [name, type, price, description, image, id], (err, result) => {
        if (err) {
            console.error('❌ Eroare la actualizarea produsului:', err);
            return res.status(500).send('Eroare la server');
        }

        console.log(`✅ Produs cu ID ${id} actualizat cu succes!`);
        res.status(200).send('Produs actualizat cu succes!');
    });
});

app.get('/products/top-selling', (req, res) => {
    const topSellingSQL = `
        SELECT p.id, p.name, p.image, p.price, COUNT(oi.product_id) AS total_sold
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        GROUP BY p.id
        ORDER BY total_sold DESC
        LIMIT 6
    `;

    db.query(topSellingSQL, (err, topResults) => {
        if (err) {
            console.error('❌ Eroare la obținerea produselor populare:', err);
            return res.status(500).send('Eroare la server.');
        }

        if (topResults.length >= 6) {
            return res.json(topResults);
        }

        // Dacă nu sunt suficiente produse, luăm altele la întâmplare din baza de date
        const needed = 6 - topResults.length;
        const randomSQL = `
            SELECT id, name, image, price
            FROM products
            WHERE id NOT IN (${topResults.map(p => p.id).join(',') || 'NULL'})
            ORDER BY RAND()
            LIMIT ?
        `;

        db.query(randomSQL, [needed], (err, randomResults) => {
            if (err) {
                console.error('❌ Eroare la obținerea produselor aleatorii:', err);
                return res.status(500).send('Eroare la server.');
            }

            const finalResults = [...topResults, ...randomResults];
            res.json(finalResults);
        });
    });
});






// Obține mărimile și stocurile pentru un produs
app.get('/admin/products/:id/sizes', isAuthenticated, isAdmin, (req, res) => {
    const { id } = req.params;
    const sql = `SELECT size, stock FROM product_sizes WHERE product_id = ?`;

    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error('❌ Eroare la obținerea stocurilor pe mărimi:', err);
            return res.status(500).json({ error: 'Eroare la server.' });
        }

        if (results.length === 0) {
            console.warn(`⚠️ Produsul ${id} nu are stocuri pe mărimi definite.`);
            return res.json([]); // Trimitem un array gol în loc de eroare
        }

        res.json(results);
    });
});

app.get('/products/:id/sizes', (req, res) => {
    const { id } = req.params;
    const sql = `SELECT size, stock FROM product_sizes WHERE product_id = ?`;

    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error('❌ Eroare la obținerea stocurilor pe mărimi:', err);
            return res.status(500).json({ error: 'Eroare la server.' });
        }

        if (results.length === 0) {
            console.warn(`⚠️ Produsul ${id} nu are stocuri pe mărimi definite.`);
            return res.json([]); // Trimitem un array gol
        }

        res.json(results);
    });
});


// Actualizează stocurile pe mărimi pentru un produs
app.post('/admin/products/:id/sizes/update', express.json(), isAuthenticated, isAdmin, (req, res) => {
    const { id } = req.params;
    const { stockUpdates } = req.body;

    const updatePromises = stockUpdates.map(({ size, stock }) => {
        return new Promise((resolve, reject) => {
            const sql = `UPDATE product_sizes SET stock = ? WHERE product_id = ? AND size = ?`;
            db.query(sql, [stock, id, size], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });

    Promise.all(updatePromises)
        .then(() => {
            console.log(`✅ Stocurile pentru produsul ${id} au fost actualizate!`);
            res.status(200).send('Stocurile au fost actualizate!');
        })
        .catch(err => {
            console.error('Eroare la actualizarea stocului:', err);
            res.status(500).send('Eroare la actualizarea stocului.');
        });
});



app.post('/admin/products/delete', express.json(), isAuthenticated, isAdmin, (req, res) => {
    const { id } = req.body;

    console.log('📢 Cerere primită pentru ștergere produs:', id);

    if (!id) {
        console.error('❌ ID-ul lipsește!');
        return res.status(400).send('ID-ul produsului este necesar!');
    }

    // Ștergem mai întâi stocurile pe mărimi
    const deleteSizesSQL = 'DELETE FROM product_sizes WHERE product_id = ?';
    db.query(deleteSizesSQL, [id], (err) => {
        if (err) {
            console.error('❌ Eroare la ștergerea stocurilor produsului:', err);
            return res.status(500).send('Eroare la ștergerea stocurilor produsului.');
        }

        console.log(`✅ Stocurile pentru produsul ${id} au fost șterse.`);

        // Apoi ștergem produsul propriu-zis
        const deleteProductSQL = 'DELETE FROM products WHERE id = ?';
        db.query(deleteProductSQL, [id], (err) => {
            if (err) {
                console.error('❌ Eroare la ștergerea produsului:', err);
                return res.status(500).send('Eroare la server.');
            }

            console.log(`✅ Produsul cu ID ${id} a fost șters cu succes!`);
            res.status(200).send('Produs șters cu succes!');
        });
    });
});



app.get('/cart', (req, res) => {
    res.render('cart'); // Renderizăm pagina coșului fără să verificăm sesiunea
});




// Ruta de administrare
app.get('/admin', isAuthenticated, isAdmin, (req, res) => {
    const sql = 'SELECT * FROM products';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Eroare la interogarea produselor:', err);
            return res.status(500).send('Eroare la server');
        }
        res.render('admin', { products: results }); // Trimitem produsele în șablonul EJS
    });
});


app.post('/admin/products/add', upload.single('image'), express.urlencoded({ extended: true }), (req, res) => {
    const { name, price, description, type, gender } = req.body;
    const image = req.file ? req.file.filename : null;
    const stockData = req.body.stock || {}; // Obținem stocurile pe mărimi

    if (!name || !price || !type) {
        return res.status(400).send('Numele, prețul și tipul produsului sunt obligatorii.');
    }

    const insertProductSQL = `
        INSERT INTO products (name, price, description, type, gender, image)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(insertProductSQL, [name, price, description, type, gender || "unisex", image], (err, result) => {
        if (err) {
            console.error('Eroare la adăugarea produsului:', err);
            return res.status(500).send('Eroare la server.');
        }

        const productId = result.insertId;
        console.log(`✅ Produs adăugat cu ID: ${productId}`);

        // Salvăm stocurile pe mărimi
        const insertSizeSQL = `INSERT INTO product_sizes (product_id, size, stock) VALUES ?`;
        const sizeValues = Object.entries(stockData).map(([size, stock]) => [productId, size, parseInt(stock, 10)]);

        if (sizeValues.length > 0) {
            db.query(insertSizeSQL, [sizeValues], (err) => {
                if (err) {
                    console.error('Eroare la inserarea stocurilor:', err);
                    return res.status(500).send('Eroare la salvarea stocurilor.');
                }
                console.log('✅ Stocurile pe mărimi au fost adăugate.');
                res.redirect('/admin');
            });
        } else {
            res.redirect('/admin');
        }
    });
});



app.get('/admin/users', isAuthenticated, isAdmin, (req, res) => {
    const sql = 'SELECT id, email, role FROM users';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Eroare la interogarea utilizatorilor:', err);
            return res.status(500).send('Eroare la server');
        }
        // Transmitem ID-ul utilizatorului curent către șablon
        res.render('admin-users', { users: results, currentUserId: req.session.user.id });
    });
});

app.delete('/admin/users/delete', (req, res) => {
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ message: 'ID utilizator lipsă!' });

    const sql = 'DELETE FROM users WHERE id = ?';

    db.query(sql, [userId], (err, result) => {
        if (err) {
            console.error('Eroare la ștergerea utilizatorului:', err);
            return res.status(500).json({ message: 'Eroare la server!' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Utilizatorul nu a fost găsit!' });
        }

        res.json({ message: 'Utilizator șters cu succes!' });
    });
});


app.post('/admin/users/update-role', express.json(), isAuthenticated, isAdmin, (req, res) => {
    const { userId, newRole } = req.body;

    if (!['user', 'admin'].includes(newRole)) {
        return res.status(400).send('Rol invalid!');
    }

    const sql = 'UPDATE users SET role = ? WHERE id = ?';
    db.query(sql, [newRole, userId], (err, result) => {
        if (err) {
            console.error('Eroare la actualizarea rolului:', err);
            return res.status(500).send('Eroare la server');
        }
        res.status(200).send('Rol actualizat cu succes!');
    });
});


// Ruta pentru înregistrare
app.get('/register', (req, res) => {
    res.render('register');
});


app.post('/register', express.json(), async (req, res) => {
    const { firstName, lastName, phone, email, password } = req.body;

    if (!firstName || !lastName || !phone || !email || !password) {
        return res.status(400).send('Toate câmpurile sunt necesare!');
    }

    // Verifică dacă utilizatorul există deja
    const [existingUser] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
        return res.status(400).send('Acest email este deja folosit!');
    }

    // Hash parola (bcrypt)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generare token unic pentru verificare
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Inserează utilizatorul în baza de date
    const insertUserSQL = `
        INSERT INTO users (first_name, last_name, phone, email, password, is_verified, verification_token)
        VALUES (?, ?, ?, ?, ?, FALSE, ?)
    `;
    await db.promise().query(insertUserSQL, [firstName, lastName, phone, email, hashedPassword, verificationToken]);

    // Trimite email de verificare
    const verificationLink = `http://localhost:8000/verify-email?token=${verificationToken}`;
    const mailOptions = {
        from: '"CKN Shop" <shop.ckn.off@gmail.com>',
        to: email,
        subject: 'Verificare cont - CKN Shop',
        html: `<h3>Bun venit, ${firstName} ${lastName}!</h3>
               <p>Te rugăm să îți verifici contul făcând clic pe linkul de mai jos:</p>
               <a href="${verificationLink}">Verifică-ți contul</a>
               <p>Dacă nu ai cerut acest cont, ignoră acest email.</p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).send('Cont creat! Verifică-ți email-ul pentru activare.');
    } catch (error) {
        console.error('❌ Eroare la trimiterea emailului de verificare:', error);
        res.status(500).send('Eroare la trimiterea emailului de verificare.');
    }
});


app.get('/verify-email', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Token invalid!');
    }

    // Verifică dacă token-ul există în baza de date
    const [user] = await db.promise().query('SELECT * FROM users WHERE verification_token = ?', [token]);

    if (user.length === 0) {
        return res.status(400).send('Token invalid sau expirat!');
    }

    // Activează contul utilizatorului
    await db.promise().query('UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE verification_token = ?', [token]);

    res.send('<h3>✅ Cont activat cu succes!</h3><p>Te poți autentifica acum.</p><a href="/login">Login</a>');
});



// Ruta pentru login
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', express.json(), async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send('Email și parolă necesare!');
    }

    // Verifică utilizatorul
    const [user] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);

    if (user.length === 0) {
        return res.status(400).send('Email sau parolă incorectă!');
    }

    // Verifică dacă este activat
    if (!user[0].is_verified) {
        return res.status(400).send('Contul nu este activat! Verifică-ți email-ul.');
    }

    // Verifică parola
    const validPassword = await bcrypt.compare(password, user[0].password);
    if (!validPassword) {
        return res.status(400).send('Email sau parolă incorectă!');
    }

    // Salvează sesiunea utilizatorului
    req.session.user = {
        id: user[0].id,
        email: user[0].email,
        role: user[0].role,  // Asigură-te că există `role` în baza de date!
        firstName: user[0].first_name,
        lastName: user[0].last_name
    };
    res.send('Autentificare reușită!');
});


// Ruta pentru logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Eroare la deconectare:', err);
            return res.status(500).send('Eroare la deconectare');
        }
        res.redirect('/');
    });
});

app.get('/my-orders', (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Trebuie să fii autentificat pentru a vedea comenzile!');
    }

    const userId = req.session.user.id;

    const getOrdersSQL = `
        SELECT o.id AS order_id, o.total_price, o.created_at, 
               oi.product_id, oi.quantity, oi.price, 
               p.name AS product_name 
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON oi.product_id = p.id
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC
    `;

    db.query(getOrdersSQL, [userId], (err, results) => {
        if (err) {
            console.error('Eroare la obținerea comenzilor:', err);
            return res.status(500).send('Eroare la server');
        }

        const orders = {};
        results.forEach(row => {
            if (!orders[row.order_id]) {
                orders[row.order_id] = {
                    id: row.order_id,
                    total_price: row.total_price,
                    created_at: row.created_at,
                    items: []
                };
            }
            orders[row.order_id].items.push({
                product_id: row.product_id,
                name: row.product_name,
                quantity: row.quantity,
                price: row.price
            });
        });

        res.render('my-orders', { orders: Object.values(orders) });
    });
});

app.get('/admin/dashboard', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Acces interzis! Doar pentru administratori.');
    }

    const getOrdersSQL = `
        SELECT o.id AS order_id, o.total_price, o.created_at, u.email AS user_email 
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
    `;

    db.query(getOrdersSQL, (err, results) => {
        if (err) {
            console.error('Eroare la obținerea comenzilor:', err);
            return res.status(500).send('Eroare la server');
        }

        res.render('admin-dashboard', { orders: results });
    });
});

app.post('/product/:id/review', express.json(), async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send('Trebuie să fii autentificat pentru a adăuga o recenzie!');
    }

    const productId = req.params.id;
    const userId = req.session.user.id;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).send('Rating-ul trebuie să fie între 1 și 5.');
    }

    try {
        const insertReviewSQL = `
            INSERT INTO reviews (product_id, user_id, rating, comment, is_approved)
            VALUES (?, ?, ?, ?, FALSE)
        `;
        await db.promise().query(insertReviewSQL, [productId, userId, rating, comment]);

        res.status(201).send('Recenzia ta a fost trimisă și va fi verificată de un administrator.');
    } catch (error) {
        console.error('❌ Eroare la adăugarea recenziei:', error);
        res.status(500).send('Eroare la server.');
    }
});

app.post('/admin/reviews/approve', express.json(), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Acces interzis.');
    }

    const { reviewId } = req.body;

    try {
        const sql = `UPDATE reviews SET is_approved = TRUE WHERE id = ?`;
        await db.promise().query(sql, [reviewId]);
        res.status(200).send('Recenzia a fost aprobată.');
    } catch (error) {
        console.error('❌ Eroare la aprobarea recenziei:', error);
        res.status(500).send('Eroare la aprobarea recenziei.');
    }
});

app.post('/admin/reviews/delete', express.json(), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Acces interzis.');
    }

    const { reviewId } = req.body;

    try {
        const sql = `DELETE FROM reviews WHERE id = ?`;
        await db.promise().query(sql, [reviewId]);
        res.status(200).send('Recenzia a fost ștearsă.');
    } catch (error) {
        console.error('❌ Eroare la ștergerea recenziei:', error);
        res.status(500).send('Eroare la ștergerea recenziei.');
    }
});

app.get('/admin/reviews', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Acces interzis.');
    }

    try {
        const sql = `
            SELECT r.id, r.rating, r.comment, r.is_approved, r.created_at, 
                   u.email AS user_email, p.name AS product_name 
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            JOIN products p ON r.product_id = p.id
            ORDER BY r.created_at DESC
        `;
        const [reviews] = await db.promise().query(sql);

        res.render('admin-reviews', { reviews });
    } catch (error) {
        console.error('❌ Eroare la obținerea recenziilor:', error);
        res.status(500).send('Eroare la server.');
    }
});




app.get('/products', (req, res) => {
    const { search, type, minPrice, maxPrice, inStock } = req.query;

    let sql = `
        SELECT p.* FROM products p
        ${inStock === 'true' ? "JOIN product_sizes ps ON p.id = ps.product_id AND ps.stock > 0" : ""}
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
        const likeSearch = `%${search}%`;
        params.push(likeSearch, likeSearch);
    }

    if (type) {
        sql += ' AND p.type = ?';
        params.push(type);
    }

    if (minPrice) {
        sql += ' AND p.price >= ?';
        params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
        sql += ' AND p.price <= ?';
        params.push(parseFloat(maxPrice));
    }

    // Adaugă GROUP BY pentru a evita dublurile cauzate de JOIN
    sql += ' GROUP BY p.id';

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Eroare la filtrarea produselor:', err);
            return res.status(500).send('Eroare la server');
        }

        res.json(results);
    });
});




app.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        // Verificăm dacă utilizatorul există
        const [user] = await db.promise().query('SELECT id FROM users WHERE email = ?', [email]);
        if (user.length === 0) {
            return res.status(404).send('Utilizatorul nu există.');
        }

        const userId = user[0].id;

        // Generăm un token unic
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000); // 1 oră

        // Salvăm token-ul în baza de date
        await db.promise().query(
            'INSERT INTO password_resets (user_id, token, expiry) VALUES (?, ?, ?)',
            [userId, token, expiry]
        );

        // Trimiterea e-mailului prin Mailtrap
        const resetLink = `http://localhost:8000/reset-password/${token}`;
        await transporter.sendMail({
            from: '"Magazin Online" <no-reply@example.com>',
            to: email,
            subject: 'Resetare parolă',
            html: `<p>Apasă pe link pentru a-ți reseta parola: <a href="${resetLink}">${resetLink}</a></p>`
        });

        console.log(`Token generat: ${token}`);
        res.status(200).send('E-mailul de resetare a parolei a fost trimis.');
    } catch (err) {
        console.error('Eroare la solicitarea resetării:', err);
        res.status(500).send('A apărut o eroare. Te rugăm să încerci din nou.');
    }
});

// Ruta pentru afișarea paginii de resetare a parolei
app.get('/reset-password/:token', (req, res) => {
    const { token } = req.params;
    console.log(`Accesare resetare parolă pentru token: ${token}`);
    res.render('reset-password', { token }); // Trimite token-ul către pagina EJS
});

// Endpoint pentru resetare
app.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        // Verificăm dacă token-ul este valid
        const [result] = await db.promise().query(
            'SELECT user_id FROM password_resets WHERE token = ? AND expiry > NOW()',
            [token]
        );

        if (result.length === 0) {
            return res.status(400).send('Token invalid sau expirat.');
        }

        const userId = result[0].user_id;

        // Hash parola nouă
        const hashedPassword = await bcrypt.hash(password, 10);

        // Actualizăm parola utilizatorului
        await db.promise().query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

        // Ștergem token-ul după utilizare
        await db.promise().query('DELETE FROM password_resets WHERE token = ?', [token]);

        res.status(200).send('Parola a fost resetată cu succes.');
    } catch (err) {
        console.error('Eroare la resetarea parolei:', err);
        res.status(500).send('A apărut o eroare. Te rugăm să încerci din nou.');
    }
});

app.post('/dashboard/update', express.json(), isAuthenticated, async (req, res) => {
    const { firstName, lastName, phone } = req.body;
    const userId = req.session.user.id;

    if (!/^\d{10}$/.test(phone)) {
        return res.status(400).send('Numărul de telefon trebuie să aibă exact 10 cifre!');
    }

    const sql = 'UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?';
    db.query(sql, [firstName, lastName, phone, userId], (err, result) => {
        if (err) {
            console.error('Eroare la actualizarea datelor utilizatorului:', err);
            return res.status(500).send('Eroare la server!');
        }
        res.status(200).send('Informațiile au fost actualizate!');
    });
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const getUserInfoSQL = 'SELECT first_name, last_name, phone, email FROM users WHERE id = ?';
    const getOrdersSQL = `
        SELECT o.id AS order_id, o.total_price, o.created_at, 
               oi.product_id, oi.size, oi.quantity, oi.price, 
               p.name AS product_name
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON oi.product_id = p.id
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC
    `;

    db.query(getUserInfoSQL, [userId], (err, userResults) => {
        if (err || userResults.length === 0) {
            console.error('❌ Eroare la obținerea informațiilor utilizatorului:', err);
            return res.status(500).send('Eroare la server.');
        }

        db.query(getOrdersSQL, [userId], (err, orderResults) => {
            if (err) {
                console.error('❌ Eroare la obținerea comenzilor:', err);
                return res.status(500).send('Eroare la server.');
            }

            res.render('dashboard', { user: userResults[0], orders: orderResults });
        });
    });
});




app.get('/chat', (req, res) => {
    res.render('chat', { user: req.session.user || null });
});




app.get('/product/:id/review-summary', async (req, res) => {
    const productId = req.params.id;

    // Obținem recenziile aprobate și descrierea produsului
    const sql = `
        SELECT p.description, r.comment, r.rating 
        FROM products p 
        LEFT JOIN reviews r ON p.id = r.product_id 
        WHERE p.id = ? AND (r.is_approved = 1 OR r.is_approved IS NULL)
    `;

    db.query(sql, [productId], async (err, results) => {
        if (err) {
            console.error("❌ Eroare la obținerea recenziilor:", err);
            return res.status(500).json({ error: "Eroare la server." });
        }

        if (results.length === 0) {
            return res.json({ error: "Nu există suficiente recenzii aprobate." });
        }

        // Calculăm media rating-ului
        const approvedReviews = results.filter(r => r.rating);
        const averageRating = approvedReviews.length
            ? (approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length).toFixed(1)
            : "N/A";

        const description = results[0]?.description || "Descriere indisponibilă.";
        const reviewsText = results.map(r => r.comment).filter(Boolean).join(" ");

        if (!reviewsText) {
            return res.json({ error: "Nu există recenzii aprobate pentru acest produs.", averageRating });
        }

        // Construim prompt-ul pentru AI
        const aiPrompt = `
            Pe baza descrierii și recenziilor utilizatorilor, oferă un rezumat cu **Pro** și **Contra**.
            Descriere produs: "${description}"
            Recenzii utilizatori: "${reviewsText}"

            Format răspuns:
            ✅ Pro: [Lista punctelor forte]
            ❌ Contra: [Lista punctelor slabe]

            Fără alte texte în afara acestui format.
        `;

        try {
            const response = await fetch(process.env.API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.HF_API_TOKEN.trim()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "mistralai/Mistral-7B-Instruct",
                    messages: [{ role: "user", content: aiPrompt }],
                    max_tokens: 100,
                    temperature: 0.4
                })
            });

            const data = await response.json();
            console.log("📩 Răspuns AI:", data);

            if (!data.choices || !data.choices[0]?.message?.content) {
                throw new Error("Răspuns invalid de la AI.");
            }

            res.json({
                averageRating,
                prosCons: data.choices[0].message.content.trim()
            });

        } catch (error) {
            console.error("❌ Eroare la AI:", error);
            res.status(500).json({ error: "Nu s-a putut genera analiza recenziilor.", averageRating });
        }
    });
});


app.post("/wishlist/add", isAuthenticated, (req, res) => {
    const { product_id } = req.body;
    const user_id = req.session.user.id;

    const sql = "INSERT INTO wishlist (user_id, product_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE product_id = product_id";

    db.query(sql, [user_id, product_id], (err, result) => {
        if (err) {
            console.error("❌ Eroare la adăugarea în wishlist:", err);
            return res.status(500).json({ error: "Eroare la server" });
        }
        res.json({ message: "✅ Produs adăugat la favorite!" });
    });
});
app.post("/wishlist/remove", isAuthenticated, (req, res) => {
    const { product_id } = req.body;
    const user_id = req.session.user.id;

    const sql = "DELETE FROM wishlist WHERE user_id = ? AND product_id = ?";

    db.query(sql, [user_id, product_id], (err, result) => {
        if (err) {
            console.error("❌ Eroare la eliminarea din wishlist:", err);
            return res.status(500).json({ error: "Eroare la server" });
        }
        res.json({ message: "❌ Produs eliminat din favorite!" });
    });
});

app.get("/wishlist", isAuthenticated, (req, res) => {
    const user_id = req.session.user.id;

    const sql = `
        SELECT p.id, p.name, p.image, p.price 
        FROM wishlist w 
        JOIN products p ON w.product_id = p.id 
        WHERE w.user_id = ?`;

    db.query(sql, [user_id], (err, results) => {
        if (err) {
            console.error("❌ Eroare la obținerea wishlist-ului:", err);
            return res.status(500).json({ error: "Eroare la server" });
        }
        res.render("wishlist", { products: results });
    });
});

app.get('/checkout', (req, res) => {
    res.render('checkout');
});


app.post('/checkout', express.json(), async (req, res) => {

    if (!req.session.user) {
        return res.status(401).send('Trebuie să fii autentificat pentru a finaliza comanda!');
    }

    const { cart, discount, promoCode, address, paymentMethod } = req.body;

    if (!cart || cart.length === 0) {
        return res.status(400).send('Coșul este gol sau datele sunt invalide!');
    }

    if (!address || address.length < 10) {
        return res.status(400).send('Adresa trebuie să aibă cel puțin 10 caractere!');
    }

    if (!paymentMethod || (paymentMethod !== 'Ramburs la livrare' && paymentMethod !== 'Card bancar')) {
        return res.status(400).send('Metoda de plată este invalidă!');
    }

    // Verifică dacă utilizatorul a mai folosit acest cod promo
    if (promoCode) {
        const checkUsageSQL = `SELECT * FROM promo_usage WHERE user_id = ? AND promo_code = ?`;
        const [usedPromo] = await db.promise().query(checkUsageSQL, [req.session.user.id, promoCode]);

        if (usedPromo.length > 0) {
            return res.status(400).send('Acest cod promo a fost deja utilizat pentru o comandă anterioară!');
        }
    }

    const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountAmount = discount ? totalPrice * (discount / 100) : 0;
    const finalTotal = totalPrice - discountAmount;

    // Creare comandă
    const createOrderSQL = `
        INSERT INTO orders (user_id, total_price, address, payment_method) 
        VALUES (?, ?, ?, ?)
    `;
    
    db.query(createOrderSQL, [req.session.user.id, finalTotal, address, paymentMethod], (err, result) => {
        if (err) {
            console.error('❌ Eroare la crearea comenzii:', err);
            return res.status(500).send('Eroare la server');
        }

        const orderId = result.insertId;
        console.log(`✅ Comanda creată cu ID: ${orderId}`);

        const createOrderItemsSQL = `
            INSERT INTO order_items (order_id, product_id, size, quantity, price)
            VALUES (?, ?, ?, ?, ?)
        `;
        const updateStockSQL = 'UPDATE product_sizes SET stock = stock - ? WHERE product_id = ? AND size = ?';

        const orderPromises = cart.map(item => {
            return new Promise((resolve, reject) => {
                db.query(createOrderItemsSQL, [orderId, item.id, item.size, item.quantity, item.price], (err) => {
                    if (err) return reject(err);

                    db.query(updateStockSQL, [item.quantity, item.id, item.size], (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            });
        });

        Promise.all(orderPromises)
            .then(() => {
                console.log(`✅ Comanda #${orderId} a fost procesată!`);

                // Dacă s-a folosit un cod promo, îl marcăm ca utilizat
                if (promoCode) {
                    const usePromoSQL = `
                        INSERT INTO promo_usage (user_id, promo_code, used_at)
                        VALUES (?, ?, NOW())
                    `;
                    db.query(usePromoSQL, [req.session.user.id, promoCode], (err) => {
                        if (err) console.error('⚠️ Eroare la salvarea utilizării codului promo:', err);
                        else console.log(`✅ Codul promo ${promoCode} a fost marcat ca utilizat de user_id ${req.session.user.id}`);
                    });
                }

                // Obține email-ul utilizatorului și trimite email de confirmare
                db.query('SELECT email FROM users WHERE id = ?', [req.session.user.id], async (err, results) => {
                    if (err || results.length === 0) {
                        console.error('⚠️ Eroare la obținerea emailului utilizatorului:', err);
                    } else {
                        const email = results[0].email;
                        await sendOrderConfirmationEmail(email, orderId, cart, totalPrice, discount, finalTotal, address, paymentMethod);

                    }
                });

                // Șterge codul promo aplicat după finalizarea comenzii
                req.session.usedPromo = null;

                res.redirect('/order-success');
            })
            .catch(err => {
                console.error('❌ Eroare la procesarea comenzii:', err);
                res.status(500).send('Eroare la procesarea comenzii!');
            });
    });
});







app.get('/order-success', (req, res) => {
    res.render('order-success');
});


app.post('/validate-promo', express.json(), async (req, res) => {
    const { promoCode } = req.body;

    if (!req.session.user) {
        return res.status(401).json({ error: "Trebuie să fii autentificat pentru a aplica un cod promo!" });
    }

    try {
        // Verificăm dacă promo-ul există și nu este expirat
        const [promo] = await db.promise().query(
            "SELECT id, discount_percentage, expires_at FROM promo_codes WHERE code = ?",
            [promoCode]
        );

        if (promo.length === 0) {
            return res.status(400).json({ error: "Codul promo nu există!" });
        }

        const { id: promoId, discount_percentage, expires_at } = promo[0];

        // Verificăm dacă promo-ul este expirat
        if (new Date(expires_at) < new Date()) {
            return res.status(400).json({ error: "Codul promo a expirat!" });
        }

        // Verificăm dacă utilizatorul a folosit deja acest cod promo
        const [usage] = await db.promise().query(
            "SELECT * FROM promo_usage WHERE user_id = ? AND promo_code = ?",
            [req.session.user.id, promoId]
        );

        if (usage.length > 0) {
            return res.status(400).json({ error: "Ai utilizat deja acest cod promo!" });
        }

        // Aplicăm discount-ul
        req.session.usedPromo = promoId;
        res.json({ discount: discount_percentage, promoId });

    } catch (error) {
        console.error("Eroare la validarea codului promoțional:", error);
        res.status(500).json({ error: "Eroare la validarea codului promo!" });
    }
});

app.post('/admin/promo-codes/create', async (req, res) => {
    const { code, discount_percentage, expires_at } = req.body;

    try {
        await db.promise().query(
            "INSERT INTO promo_codes (code, discount_percentage, expires_at) VALUES (?, ?, ?)",
            [code, discount_percentage, expires_at]
        );
        res.status(200).send("Cod salvat cu succes!");
    } catch (error) {
        console.error("Eroare la salvarea codului promoțional:", error);
        res.status(500).send("Eroare la server.");
    }
});





// Pornim serverul
app.listen(PORT, () => {
    console.log(`Serverul rulează la http://localhost:${PORT}`);
});


