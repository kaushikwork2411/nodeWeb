const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const qrImage = require('qr-image');
const bodyParser = require('body-parser');
const mime = require('mime-types')
const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');
const validateUser=require('./validateuser');
const app = express();
app.use(express.json());

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

//database schema
const sessionSchema = new mongoose.Schema({
    username: String,
    sessionID: String,
    active: Boolean,
    siteName: String, // Add siteName field to store the site name
    logoutURL: String,
    createdAt: { type: Date, default: Date.now }
});


const Session = mongoose.model('Session', sessionSchema);

let qrImageBuffer = {};
let whatsappClients = {};
let store;

mongoose.connect('mongodb://127.0.0.1:27017/multiOrganizationDB')
    .then(() => {
        store = new MongoStore({ mongoose });
    })
    .catch(err => {
        console.log('Failed to connect to MongoDB:', err);
        process.exit(1);
    });


// Generate a secret key for encryption
const secretKey = 'The coding industry is a dynamic and rapidly evolving field, playing a pivotal role in various sectors. Coding skills are highly sought after, opening up opportunities both within and outside the tech industry¹. The industry encompasses 785445 a wide range of roles, including web developers, software engineers, IT technicians, and data scientists¹. Each role requires proficiency in specific coding languages. For instance, web developer@s often use ipt for front-end development and Python, Java, or 78. The industry is also witnessing a surge in demand for data scientists who leverage programming languages to analyze data and drive business decisions¹. Furthermore, the rise of mobile devices has led to an increased demand for $145$78565 in lang785450.uages like Objective-C and Java². The coding industrys infl#uence extends beyond the tech sector, with its applications found in industries like automotive, cybersecurity, e-commerce, engineering, finance, healthcare, and IT & cloud-based solutions⁴. Thus, the coding industry is not only integral to technological advancement but also instrumental in shaping various other industries';


app.post('/api/start-session/:username/:siteName', async (req, res) => {
    // console.log(req, req.rawHeaders);
    const username = req.params.username;
    const siteName = req.params.siteName;
    const logoutURL = req.body.logoutURL;
    // const encryptionKey = req.body.encryptionKey;
    const validKey = req.headers['validkey'];

    const authetication=validateUser(secretKey);
    console.log("encrypted: " + validKey);
    console.log("url: " + logoutURL);

    // Verify authenticity of request

    console.log("decryption : " + hash);
    if (validKey != authetication) {
        return res.status(401).json({ message: 'Unauthorized ' });
    }

    let sessionID = uuidv4();
    const activeSession = await Session.findOne({ username, active: true });
    if (activeSession) {
        sessionID = activeSession.sessionID;
        return res.status(200).json({ message: 'You have an active session', sessionID: activeSession.sessionID });
    } else {
        const session = new Session({ username, sessionID, active: false, siteName, logoutURL });
        await session.save();
        whatsappClients[sessionID] = new Client({
            authStrategy: new RemoteAuth({
                clientId: sessionID,
                store,
                backupSyncIntervalMs: 300000,
            }),
        });
    }

    whatsappClients[sessionID].on("ready", () => {
        console.log("client is ready to sent message...");
    })

    whatsappClients[sessionID].on('qr', qr => {
        qrImageBuffer[sessionID] = qrImage.imageSync(qr, { type: 'png' });
        console.log(qrImageBuffer[sessionID]);
    });

    whatsappClients[sessionID].on('authenticated', async (session) => {
        console.log('Authenticated successfully with session:', sessionID);
        try {
            const dbSession = await Session.findOne({ username, sessionID });
            if (dbSession) {
                dbSession.active = true;
                await dbSession.save();
            }
        } catch (error) {
            console.log('Error updating session active status:', error);
        }
    });

    whatsappClients[sessionID].on('disconnected', async (reason) => {
        console.log('Client'  + 'sessoin id :' + sessionID + ' disconnected:', reason);
        if (reason === 'session' || reason === 'qr' || reason === 'auth_failure') {
            console.log('Session expired. You need to reauthenticate.');
            whatsappClients[sessionID].initialize().catch(err => {
                console.log('Failed to initialize WhatsApp client:', err);
            });
        }

        // Retrieve the logout URL from the database
        const session = await Session.findOne({ sessionID });
        if (!session) {
            console.log('Session not found in the database');
        }

        const logoutURL = session.logoutURL;
        console.log(logoutURL);
        // Send a GET request to the logout URL
        try {
            await axios.get(logoutURL + `/${sessionID}`);
            console.log('Logout URL sent successfully');
        } catch (error) {
            console.log('Error sending logout URL:',);
        }

    });

    whatsappClients[sessionID].initialize().catch(err => {
        console.log('Failed to initialize WhatsApp client:', err);
    });

    res.status(200).json({ message: 'Session started successfully', sessionID });
});

app.get('/api/apex/:sessionID',(req,res)=>{
    res.json({apex: "redirect successfully "+req.params.sessionID});
})
app.get('/api/qr-code/:username/:sessionID', async (req, res) => {
    const username = req.params.username;
    const sessionID = req.params.sessionID;
    const validKey = req.headers['validkey'];
  
    const hash = validateUser(secretKey);
    console.log("encrypted: " + validKey);
    console.log("url: " + logoutURL);

    // Verify authenticity of request

    console.log("decryption : " + hash);
    if (validKey != hash) {
        return res.status(401).json({ message: 'Unauthorized ' });
    }

    const session = await Session.findOne({ username, active: true });
    if (session) {

        return res.status(200).json({ message: 'You already have an active session', sessionID: session.sessionID });
    } else {
        try {
            if (!qrImageBuffer[sessionID]) {
                return res.status(404).json({ error: 'QR code not available' });
            }
            const base64String = qrImageBuffer[sessionID].toString('base64');
            // return res.status(200).json({ QrBase64:base64String });
            res.contentType('image/png').end(qrImageBuffer[sessionID], 'binary');
        } catch (error) {
            console.log('Error sending QR code:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

});

app.post('/api/send-message/:username/:sessionID', async (req, res) => {
    const { username, sessionID } = req.params;
    // const encryptionKey = req.body.encryptionKey;
    const validKey = req.headers['validkey'];
    const hash = validateUser(secretKey);
    const recipientNumbers = [
        '919667700177@c.us',
        // '919104884174@c.us',
        // '918141001454@c.us',
        // '916355357459@c.us',
        // '919726551335@c.us',
        // Add more numbers here as needed
    ];

    //fetch data which is coming from body.
    const bodyData = req.body;
    const pdf64Read = bodyData.pdf;
    const recipientList = bodyData.contactList;
    const pdfCaption = bodyData.pdfCaptionMessage

    // Verify authenticity of request
    if (validKey !== hash) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    let filePath = './demo.pdf';
    const b64data = fs.readFileSync(filePath, { encoding: 'base64' });// Read the PDF file content and encode it as base64

    var filename = path.basename(filePath);
    const mimetype = mime.lookup(filePath);
    const media = new MessageMedia(mimetype, b64data, filename);

    const session = await Session.findOne({ username, sessionID });
    if (!session) {
        return res.status(404).json({ error: 'Invalid session ID' });
    }
    try {
        for (const recipient of recipientNumbers) {
            ///********************* */
            // if(pdf64Read){
            await whatsappClients[sessionID].sendMessage(recipient, media, { caption: 'hi', sendMediaAsDocument: true, thumbnailHeight: 480, thumbnailWidth: 339 }).then(() => {
                console.log('Message sent successfully');

            });
            // }else{
            //****************** */
            // await whatsappClients[sessionID].sendMessage(recipient, 'Hello from WhatsApp!').then(() => {
            //     console.log('Message sent successfully');
            //     res.status(200).json({ message: 'Message sent successfully' });
            // })
            // }
            console.log(`Message sent successfully to ${recipient}`);

        }
        res.status(200).json({ message: 'Message sent successfully' });
        // whatsappClients[sessionID].sendMessage('919667700177@c.us', "hello from whatsapp.")
        //     .then(() => {
        //         console.log('Message sent successfully');
        //         res.status(200).json({ message: 'Message sent successfully' });
        //     })
        //     .catch(err => {
        //         console.error('Error sending message:', err);
        //         res.status(500).json({ error: 'Error sending message' });
        //     });
    } catch (error) {
        console.log('Error in send-message endpoint:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
