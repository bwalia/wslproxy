const express = require('express');
//const multer  = require('multer');
const AWS = require('aws-sdk');
//const fs=require('fs');
//const keys = require('./.keys.js');
const { parse } = require('dotenv');
require('dotenv').config();

const app = express();

const portNum = process.env.PORT || 3000;
const bucketName = process.env.BUCKET_NAME || 'webimpetus-images';
const regionCode = process.env.AWS_REGION || 'eu-west-2';

console.log('Bucket Name: ' + bucketName);

// console.log('Port Number: ' + portNum);
// console.log('AWS_ACCESS_KEY_ID: ' + process.env.AWS_ACCESS_KEY_ID);
// console.log('AWS_SECRET_ACCESS_KEY: ' + process.env.AWS_SECRET_ACCESS_KEY);
// console.log('AWS_REGION: ' + regionCode);

//setting the credentials
//The region should be the region of the bucket that you created
//Visit this if you have any confusion - https://docs.aws.amazon.com/general/latest/gr/rande.html
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, //keys.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, //keys.iam_secret,
    region: regionCode
});

//Creating a new instance of S3:
const s3= new AWS.S3();

//GET method route for downloading/retrieving file
app.get('*',(req,res,next)=>{
  let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  //console.log(fullUrl);
  //console.log(req.originalUrl);
  retrieveFile(req.originalUrl , res);
  //next();
});

//listening to server 3000
app.listen(portNum,()=>{
    console.log('Workstation S3 Retriever running on port ' + portNum);
});

//The retrieveFile function
function retrieveFile(filename,res){
  console.log('Retrieving file: ' + filename);
  //return res.send({success:true, message:'File: ' + filename + ' is retrieved successfully'});
  filename = filename.substr(1, filename.length - 1); 
  console.log('Retrieving file: ' + filename);

  const getParams = {
    Bucket: bucketName,
    Key: filename
  };

  s3.getObject(getParams, function(err, data) {
    if (err){
      return res.status(400).send({success:false,err:err});
    }
    else{
      return res.send(data.Body);
    }
  });
}
