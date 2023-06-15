const Express = require('express');
const Core = require("./core")
const Path = require("path")
const Fs = require("fs")

let app = Express();

app.use(Express.static(Path.join(__dirname, "static")))
app.use(Express.static(Path.join(__dirname, "dependence")))
app.set('views', Path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

function dateToString(string) {
    const arr = string.split("-")
    return arr[1]+arr[2]
}

function stringForm(string) {
    if (Number(string[0])) {
        return "."+ string
    }
    return string
}


app.get('/', function (req, res) {
    const Sync = new Core.Synchronization()
    let temp = [];
    for (let key of Sync.SaveSequence) {
        temp.push(Sync.LocationJsonData.get(key))
    }
    res.render('index', { title: "收文管理平台" , list: temp})
})

app.get('/download', function(req, res){
    const Sync = new Core.Synchronization()
    let files = Fs.readdirSync(Path.join(__dirname, "/dependence/files/"+req.query.id))
    if (files.length === 0) {
        res.redirect("/")
    } else if (files.length > 2) {
    } else {
        res.download(__dirname+"/dependence/files/"+req.query.id+"/"+files[0], dateToString(Sync.LocationJsonData.get(req.query.id).date) + stringForm(files[0]))
    }
})

app.get('/update', (req, res) => {
    const Synchronization= new Core.Synchronization()
    const timeOut = setTimeout(async (res) => {
        await Synchronization.stop();
        res.send({status: 2})
    }, 120 * 1000, res)
    try {
        Synchronization.start().then(()=>{
            clearTimeout(timeOut)
            let resData = {}
            switch (Synchronization.STATUS) {
                case 0: resData = {status: 0}
                        break;
                case 1: resData = {status: 1, newId: Synchronization.NEW }
                        break;
                case 2: resData = {status: 2}
                        break;
            }
            res.send(resData)
        });
    } catch (error) {
        console.log(error)
        res.send(error)
    }
})

app.get('/data', (req, res)=>{
    res.send(JSON.parse(Fs.readFileSync(Path.join(__dirname, "DispatchOrMailInfo.json"))));
})


let server = app.listen(8081,  function () {
    let host = server.address().address
    let port = server.address().port
    console.log("应用实例，访问地址为 http://%s:%s", host, port)

})