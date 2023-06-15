const Puppeteer = require("puppeteer")
const Cheerio = require("cheerio")
const Compressing = require("compressing")
const Path = require("path")
const Fs = require("fs")
const TimeoutError = Puppeteer.TimeoutError
const CreateWorker = require("tesseract.js").createWorker

class Synchronization {
    DependenceDir = Path.join(__dirname, "dependence")
    FileSavePath= Path.join(this.DependenceDir, "files")
    DispatchOrMailInfoJsonFilePath = Path.join(this.DependenceDir, "DispatchOrMailInfo.json")
    ValidateImagePath = Path.join(this.DependenceDir, "ValidateCode.png")
    LangPath = Path.join(this.DependenceDir, "lang-data")
    SaveSequencePath = Path.join(this.DependenceDir, "SaveSequence.json")

    LoginUrl = "https://jxoa.jxt189.com/jascx/Login.aspx"
    MessageUrl = "https://jxoa.jxt189.com/jascx/Message/MessageAlertHistory.aspx"
    DispatchMainUrl = "https://jxoa.jxt189.com/jascx/CommonForm/DispatchView.aspx?formId="
    MailMainUrl = "https://jxoa.jxt189.com/jascx/InternalMail/View.aspx?mailId="
    DownloadDispatchUrl = "https://jxoa.jxt189.com/jascx/CommonForm/DownLoadALL.aspx?formId="
    DownloadMailFileUrl = "https://jxoa.jxt189.com/jascx/InternalMail/DownLoadAll.aspx?id="

    ACCOUNT = "dqpaxwxx"
    PASSWORD = "^QhkD19QP$"

    BROWSER = {};
    PAGE = {};
    WORKER = {};
    NEW= [];
    // 0 - 登录失败; 1 - 登录成功; 2 - 出现未知错误
    STATUS = 0;

    TEMPORARY = "temporary.zip"
    LOCK = true

    DispatchOrMailInfoMap = new Map();
    LocationJsonData = this.initializationLocationJsonData();
    SaveSequence = this.initializationSaveSequence();

    DownloadFunction = `
        function downFile(url, fileName) {
        const x = new XMLHttpRequest()
        x.open('GET', url, true)
        x.responseType = 'blob'
        x.onload = function() {
            const url = window.URL.createObjectURL(x.response)
            const a = document.createElement('a')
            a.href = url
            a.download = fileName
            a.click()
        }
        x.send()}
    `

    initializationSaveSequence(){
        if ( Fs.existsSync(this.SaveSequencePath) ) {
            return JSON.parse(String(Fs.readFileSync(this.SaveSequencePath)))
        } else {
            Fs.writeFile(
                this.SaveSequencePath,
                JSON.stringify([], null, 4),
                (error) => {
                    if (error) { return console.log(error) }
                    console.log("创建新的" + this.SaveSequencePath + "文件")
                })
            return [];
        }
    }
    updateSaveSequence(){
        this.enterStack()
        Fs.writeFile(
            this.SaveSequencePath,
            JSON.stringify(this.SaveSequence, null, 4),
            (error) => {
                if (error) { return console.log(error) }
                console.log("更新" + this.SaveSequencePath + "文件")
            }
        )
    }
    initializationLocationJsonData(){
        if ( Fs.existsSync(this.DispatchOrMailInfoJsonFilePath) ) {
            return this.objectToMap(JSON.parse(String(Fs.readFileSync(this.DispatchOrMailInfoJsonFilePath))))
        } else {
            Fs.writeFile(
                this.DispatchOrMailInfoJsonFilePath,
                JSON.stringify({}, null, 4),
                (error, data) => {
                    if (error) { return console.log(error) }
                    console.log("创建新的" + this.DispatchOrMailInfoJsonFilePath + "文件")
                })
            return new Map();
        }
    }

    updateLocationJsonData(){
        for (let i = 0; i < this.NEW.length - 1; i++) {
            this.LocationJsonData.set(
                this.NEW[i],
                this.DispatchOrMailInfoMap[this.NEW[i]],
            )
        }
        Fs.writeFile(
            this.DispatchOrMailInfoJsonFilePath,
            JSON.stringify(this.mapToObject(this.DispatchOrMailInfoMap), null, 4),
            (error) => {
                if (error) { return console.log(error) }
                console.log("更新" + this.DispatchOrMailInfoJsonFilePath + "文件")
            })

    }
    setNewArray(){
        if ( this.LocationJsonData.size === 0 ) {
            for (const key of this.DispatchOrMailInfoMap.keys()) {
                this.NEW.push(key);
            }
        } else {
            for (const key of this.DispatchOrMailInfoMap.keys()) {
                if (!this.LocationJsonData.has(key)) {
                    this.NEW.push(key);
                }
            }
        }

    }

    // 提取URL中的Id参数
    extraIdFromUrl(url) {
        return url.substring(url.indexOf("=") + 1, url.lastIndexOf("'"))
    }
    // 删除字符串多余空格并通过单个空格分割字符串为数组
    spliceString(str) {
        return str.trim().replace(/\s{2,}/g, ' ').split(' ')
    }
    mapToObject(map) {
        let object = Object.create(null);
        for (const [key, value] of map) {
            object[key] = value;
        }
        return object;
    }
    objectToMap(object) {
        let map = new Map();
        for (const key of Object.keys(object)) {
            map.set(key, object[key]);
        }
        return map;
    }
    enterStack(){
        for (let i = this.NEW.length - 1; i >= 0 ; i--) {
            this.SaveSequence.push(this.NEW[i])
        }
    }
    constructor() {}
    // 初始化浏览器并新建标签页
    async createBrowserAndPage(){
        this.BROWSER = await Puppeteer.launch({
            headless: 'new',
            args: [
                '--use-gl=egl',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized'
            ],
        });
        console.log("创建浏览器")
        this.PAGE = await this.BROWSER.newPage()
        console.log("创建页面")
        const client = await this.PAGE.target().createCDPSession()
        // 设置浏览器下载地址
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: this.FileSavePath
        })
        // 创建并初始化OCR识别
        this.WORKER = await CreateWorker({ langPath: this.LangPath });
        await this.WORKER.loadLanguage("eng");
        await this.WORKER.initialize('eng');
    }
    // 主要工作函数
    async start() {
        await this.createBrowserAndPage();
        let timeOut = setTimeout(
            async () => {
               await this.stop();
            }, 10 * 1000);
        await this.userLogin().then(async ()=>{
            clearTimeout(timeOut)
            try {
                await this.getDispatchOrMailInfo().then( async ()=>{
                    this.setNewArray();
                    if (this.NEW.length !== 0) {
                        await this.downloadMain().then( async () => {
                            await this.updateSaveSequence();
                            await this.updateLocationJsonData();

                        });
                    } else {
                        console.log("不需要更新!")
                    }
                    await this.PAGE.close().then(()=>{
                        console.log("关闭页面")
                    });
                    await this.BROWSER.close().then(()=>{
                        console.log("关闭浏览器")
                        this.STATUS = 1;
                    });
                });
            } catch (error) {
                console.log(error)
            }
        })
    }
    async stop(){
        try {
            this.STATUS = 0;
            await this.PAGE.close()
            await this.BROWSER.close()
            throw new Error("TimeOut")
        } catch (error) {
            console.log("[登录超时，执行错误] " + error)
        }
    }
    // 获取消息列表的信息
    async getDispatchOrMailInfo() {
        // 打开消息列表页面
        await this.PAGE.goto(this.MessageUrl, {waitUntil: 'load'})
        // 获取消息列表HTML内容
        const $ = Cheerio.load( await this.PAGE.evaluate( ()=> {
            return $("#dtg_Data").html().replace(/[\r\n\t]/g,"");
        }));
        for ( const aTageElementArrayItem of $("a").slice(0,20) ) {
            const dispatchInfo = this.spliceString(aTageElementArrayItem.parent.prev.data)
            this.DispatchOrMailInfoMap.set(this.extraIdFromUrl(aTageElementArrayItem.attribs.onclick), {
                id: this.extraIdFromUrl(aTageElementArrayItem.attribs.onclick),
                name: aTageElementArrayItem.children[0].data,
                date: dispatchInfo[2],
                time: dispatchInfo[3],
                type: dispatchInfo[1],
            })
        }

    }
    async waitDownloadFinish(){
        this.LOCK = true
        while(this.LOCK) {
            console.log("等待")
            await new Promise(r => setTimeout(r, 500))
            if( Fs.existsSync(Path.join(this.FileSavePath, this.TEMPORARY)) ) {
                this.LOCK = false;
            }
        }
    }
    // 模拟用户登录操作
    async userLogin() {
        // 打开用户登录页面
        await this.PAGE.goto( this.LoginUrl, { waitUntil: 'load' } )
        // 输入用户账号密码
        await this.PAGE.type('#txt_Account_Input',this.ACCOUNT);
        await this.PAGE.type('#txt_Password',this.PASSWORD);
        // 截取验证码图片
        const ImageValidateCode = await this.PAGE.$(".ImageValidateCode")
        ImageValidateCode.screenshot({ path: this.ValidateImagePath }).then( async ()=>{
            // 识别验证码
            const { data: { text } } = await this.WORKER.recognize(this.ValidateImagePath);
            // 输入验证码
            await this.PAGE.type('#txt_ValidateCode', text);
        })
        try {
            await this.PAGE.waitForNavigation({ timeout: 5000 }).then( async ()=> {
                try {
                    await this.PAGE.waitForSelector("#link_MessageAlertNewLink", { timeout: 5000 }).then( ()=> {
                        console.log("登录成功")
                    });
                } catch (error) {
                    if (error instanceof TimeoutError) { await this.userLogin() }
                }
            });
        } catch (error) {
            if (error instanceof TimeoutError) { await this.userLogin() }
        }
    }
    async openDispatch(dispatchId) {
        await this.PAGE.goto(`${this.DispatchMainUrl}${dispatchId}`)
        await this.PAGE.on('dialog', async dialog => {
            await dialog.accept();
        })
        await new Promise(r => setTimeout(r, 2000));
    }
    async openMail(mailID) {
        await this.PAGE.goto(`${this.MailMainUrl}${mailID}`)
        await new Promise(r => setTimeout(r, 2000));
    }

    async downloadDispatchFile( dispatchId, dispatchName ) {
        try {
            await this.PAGE.evaluate(
                `${this.DownloadFunction};
                downFile("${this.DownloadDispatchUrl}${dispatchId}",
                "${this.TEMPORARY}")`
            )
            console.log("正在下载文件："+dispatchName)
            await this.compressingFile(dispatchId, dispatchName);
        } catch(error) {
            console.log(error)
        }
    }

    async compressingFile(id, name) {
        await this.waitDownloadFinish();
        await Compressing.zip.uncompress(
            Path.join(this.FileSavePath, this.TEMPORARY),
            Path.join(this.FileSavePath, id),
            { zipFileNameEncoding:'GBK' }
        ).then( ()=> {
            Fs.unlink(Path.join(this.FileSavePath, this.TEMPORARY),() => {} )
            console.log("解压\""+name+"\">>"+id)
        });
    }

    async downloadMailFile(mailId, mailName){
        try {
            await this.PAGE.evaluate(
                `if ($(".formTable_Item>div>a").length > 0) {
                    const id = window.location.href;
                    const mailId = id.substr(id.indexOf("=")+1,6);
                    ${this.DownloadFunction};
                    downFile("${this.DownloadMailFileUrl}"+mailId,"${this.TEMPORARY}")
                }`)
            console.log("正在下载文件："+mailName)
            await this.compressingFile(mailId, mailName);
        } catch(error) {
            console.log(error)
        }
    }

    async downloadMain(){
        const mailArray = [];
        for (const key of this.NEW) {
            if (this.DispatchOrMailInfoMap.get(key).type === "收文签收") {
               await this.openDispatch(key);
               await this.downloadDispatchFile(key, this.DispatchOrMailInfoMap.get(key).name)
            } else {
                mailArray.push(key);
            }
        }
        for (const key of mailArray) {
            await this.openMail(key)
            await this.downloadMailFile(key,this.DispatchOrMailInfoMap.get(key).name)
        }
    }
}

module.exports = {
    Synchronization: Synchronization
}