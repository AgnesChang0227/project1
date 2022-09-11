//ready database before client visit the url
const {MongoClient,ObjectId} = require("mongodb");
let db;

const express = require("express");
const multer = require("multer");//for upload folders
const upload = multer();
const sanitizeHTML = require("sanitize-html")
const fse = require("fs-extra");
const sharp = require("sharp");
const path = require("path");
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const AnimalCard = require('./src/components/AnimalCard').default;


//when the app first launches, 確保public-upload-photos folder exists
fse.ensureDirSync(path.join("public","uploaded-photos"));

const app = express();

app.set("view engine","ejs");
app.set("views","./views");
app.use(express.static("public"))

app.use(express.json());//if browser send JSON to server => 解析
app.use(express.urlencoded({extended:false}))//如果用舊的html form

function passwordProtected(req,res,next){//middleware
    res.set("WWW-Authenticate","Basic realm='Our MERN App");
    if (req.headers.authorization=="Basic YWRtaW46YWRtaW4="){
        next();
    }else {
        console.log(req.headers.authorization);//反推得出
        res.status(401).send("Try Again");
    }
}

app.get("/",async (req,res)=>{
    const allAnimals=await db.collection("animals").find().toArray();
    const generatedHTML = ReactDOMServer.renderToString(
        <div className="container">
            {!allAnimals.length && <p>no animals，請admin add few</p>}
            <div className="animal-grid mb-3">
                {allAnimals.map(animal=><AnimalCard
                    key={animal.id} name={animal.name} species={animal.species}
                    photo={animal.photo} id={animal._id} readOnly={true}/>)}
            </div>
            <p><a href="/admin">Login / manage the animal listings.</a></p>
        </div>
    )
    res.render("home",{generatedHTML});
})
app.use(passwordProtected);//接下來的page都要password

app.get("/admin",(req, res)=>{
    res.render("admin")
})
app.get("/api/animals",async (req, res)=>{
    const allAnimals=await db.collection("animals").find().toArray();
    res.json(allAnimals);//show raw data
})

//create data
//upload.single("phote") => can only put a single file
app.post("/create-animal",upload.single("photo"),ourCleanup,async (req, res)=>{
   if (req.file){//如果真的有file => photo
    const photoFilename = `${Date.now()}.jpg`
       //resize => 重新設置jpg size
       await sharp(req.file.buffer).resize(844,456).jpeg({quality:60})
           .toFile(path.join("public","uploaded-photos",photoFilename));
    req.cleanData.photo = photoFilename;
   }

    console.log(req.body);
    //insert in database 的 object
    const info = await db.collection("animals").insertOne(req.cleanData);
    const newAnimal = await db.collection("animals").findOne({_id: new ObjectId(info.insertedId)})
    res.send(newAnimal);
})

//delete data
app.delete("/animal/:id",async (req,res)=>{
    if(typeof req.params.id!="string"){req.params.id=""}
    const doc = await db.collection("animals").findOne({_id:new ObjectId(req.params.id)})
    //remove the photo from uploaded-photos
    if(doc.photo){fse.remove(path.join("public","uploaded-photos",doc.photo))}
    //delete the data from collection
    db.collection("animals").deleteOne({_id:new ObjectId(req.params.id)})
    res.send("Good Job");
})

//Edit data
app.post("/update-animal",upload.single("photo"),ourCleanup,async (req,res)=>{
    if (req.file){//如果已經有圖片了
        //copy the code from create-animals
        const photoFilename = `${Date.now()}.jpg`
        await sharp(req.file.buffer).resize(844,456).jpeg({quality:60})
            .toFile(path.join("public","uploaded-photos",photoFilename));
        req.cleanData.photo = photoFilename;
        //find and update => delete the original photo
        const info =await db.collection("animals")
            .findOneAndUpdate({_id:new ObjectId(req.body._id)},{$set:req.cleanData});
        if (info.value.photo){
            fse.remove(path.join("public","uploaded-photos",info.value.photo))
        }
        res.send(photoFilename);
    }else{//if not
        db.collection("animals")
            .findOneAndUpdate({_id:new ObjectId(req.body._id)},{$set:req.cleanData});
        res.send(false);
    }
})

function ourCleanup(req,res,next){
    if (typeof req.body.name != "string"){req.body.name=""}
    if (typeof req.body.species != "string"){req.body.species=""}
    if (typeof req.body._id != "string"){req.body._id=""}
    req.cleanData = {
        name:sanitizeHTML(req.body.name.trim(),{allowedTags:[],allowedAttributes: {}}),
        species:sanitizeHTML(req.body.species.trim(),{allowedTags:[],allowedAttributes: {}}),
    }
    next();
}

async function start(){
    const client = new MongoClient("mongodb://localhost:27017/AmazingMernApp?&authSource=admin");
    await client.connect();
    db = client.db();
    app.listen(3080)
}
start();
