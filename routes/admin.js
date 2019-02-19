const express = require('express')
var router = express.Router()

// google oauth setup
const { google } = require("googleapis")

oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `http://${process.env.DOMAIN}/admin/login/google/callback`
);

const oauth2Scopes = [
  //'https://www.googleapis.com/auth/plus.me'
  'profile',
  'email'
];

const oauth2Url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: oauth2Scopes
});

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    // TODO: store the refresh_token in the database!
    //console.log("rt: ---------")
    //console.log(tokens.refresh_token);
  }
  //console.log("at: ---------")
  //console.log(tokens.access_token);
});

// mssql database configuration
const sql = require('mssql')

const config = {
    user: process.env.SQL_USERNAME,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE/*,
    dialect: "mssql",
    dialectOptions: {
        instanceName: "SQLEXPRESS"
    }*/
}

sql.connect(config, err => {
    // ... error checks
    //if (err) console.log(err)
    //else console.log("Successfully connected to the sql server")
})

function getUserData(id) {
  new sql.Request().query(`SELECT * FROM Users WHERE ID = ${id}`, (err, result) => {
      if (err) console.log(err)
      new sql.Request().query(`SELECT userRole FROM UserRoles WHERE userID = ${id}`, (err, result2) => {
          if (err) console.log(err)
          let ret = result.recordset[0]
          ret.roles = result2.recoedset
          return ret
      })
  })
}


// redirect to Google oauth
router.get("/login", (req, res, next) => {
  res.redirect("/admin/login/google")
})

router.get("/login/google", (req, res, next) => {
  res.redirect(oauth2Url)
})

router.get("/login/google/callback", async (req, res, next) => {
  const {tokens} = await oauth2Client.getToken(req.query.code)
  oauth2Client.setCredentials(tokens)

  //console.log(tokens)

  var oauth2 = google.oauth2({
    auth: oauth2Client,
    version: 'v2'
  })
  oauth2.userinfo.get((err, gRes) => {
    if (err) {
      console.log(err)
    } else {
      //console.log(res.data)

      new sql.Request().query('SELECT ID FROM Users WHERE googleID = \'' + gRes.data.id + '\'', (err, result) => {
          if (err) console.log(err)

          if(result.recordset.length > 0) {
            res.redirect("/admin/dashboard")
            req.session.userID = result.recordset[0].ID
          } else {
            let query = `INSERT INTO Users (googleID, googleRefreshToken, email, firstName, lastName, displayName) VALUES (${gRes.data.id},'${tokens.refresh_token}', '${gRes.data.email}', '${gRes.data.given_name}', '${gRes.data.family_name}', '${gRes.data.name}')`
            //console.log(query)
            new sql.Request().query(query, (err, result) => {
                if (err) console.log(err)

                new sql.Request().query(`SELECT ID FROM Users WHERE googleID = '${gRes.data.id}'`, (err, result) => {
                    if (err) console.log(err)
                    req.session.userID = result.recordset[0].ID
                })
            })
            res.redirect("/admin/newUser")

          }
      })
    }
  });
})

// Check if user is logged in
router.use((req, res, next) => {
  if(req.session) {
    // has access
    //res.send(req.session)
    next();
  } else if(req.session.userID) {
    // Not member of any role
    res.render("dynamic/admin/newuser")
  } else {
    // Not logged in
    res.render("dynamic/admin/notLoggedIn")
  }
})

router.get("/Brukere", (req, res, next) => {
  if(!req.query || Object.getOwnPropertyNames(req.query).length === 0 || (req.query.q === "" && Object.getOwnPropertyNames(req.query).length === 1)) {
    res.render("public/admin/Brukere", {
      user: [
        {
          id: 1,
          name: "Theodor Kvalsvik Lauritzen",
          roles: ["Admin", "Blogger"]
        },
        {
          id: 2,
          name: "Elias Kvalsvik Lauritzen",
          roles: ["Blogger"]
        },
        {
          id: 3,
          name: "Ola Nordmann",
          roles: []
        }
      ]
    })
  } else {
    res.render("public/admin/Brukere", {
      query: req.query,
      user: [
        {
          name: req.query.q,
          roles: [req.query.roleAdmin ? "Admin" : "", req.query.roleBlogger ? "Blogger" : ""]
        }
      ]
    })
  }

  /*
  SELECT * FROM mytable
  WHERE column1 LIKE '%word1%'
    AND column1 LIKE '%word2%'
    AND column1 LIKE '%word3%'
  */
})

module.exports = router;
