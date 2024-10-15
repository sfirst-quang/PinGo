const fs = require('fs');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const { HttpsProxyAgent } = require('https-proxy-agent');

class PinGo {
    constructor() {
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "Content-Type": "application/json",
            "Origin": "https://punny.pingo.work",
            "Referer": "https://punny.pingo.work/",
            "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
        this.proxyList = this.loadProxies();
        this.config = this.loadConfig();
    }

    loadProxies() {
        return fs.readFileSync("proxy.txt", 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
    }

    loadConfig() {
        const configData = fs.readFileSync("config.json", 'utf8');
        const config = JSON.parse(configData);
        return config;
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', { httpsAgent: proxyAgent });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                this.log(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`, 'warning');
                return null;
            }
        } catch (error) {
            this.log(`Error khi kiểm tra IP của proxy: ${error.message}`, 'error');
            return null;
        }
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`.magenta);
                break;        
            case 'error':
                console.log(`[${timestamp}] [!] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${msg}`.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Chờ ${i} giây để tiếp tục vòng lặp =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    tryGetUserInfo(queryId) {
        try {
            const userData = JSON.parse(decodeURIComponent(queryId.split('user=')[1].split('&')[0]));
            const userId = userData.id;
            const firstName = userData.first_name;
            return {userId: userId, firstName: firstName}
        } catch {
            return {userId: "", firstName: ""}
        }
    }

    async login(queryId, proxy) {
        const payload = {Authorization: queryId}
        try {
            const response = await axios.post("https://pingo.work/api/auth/miniapp/login", payload, { headers: this.headers, httpsAgent: new HttpsProxyAgent(proxy) });
            if(response && response.data.code === 200) {
                this.log(`Đăng nhập thành công: `);
                return response.data.data.token;
            }
            return null;
        } catch(error) {
            this.log(`Đăng nhập gặp lỗi: ${error.message}`, 'error');
            return null;
        }
        
    }

    async dailyCheckin(token, proxy) {
        const headers = {
            ...this.headers,
            "Authorization": token
        }
        try {
            const response = await axios.get("https://pingo.work/api/punny/quests/dayCheck", { headers, httpsAgent: new HttpsProxyAgent(proxy) });
            if(response && response.data.code === 200) {
                this.log(`Daily checkin thành công...`, 'success');
            } else {
                this.log(`Hôm nay bạn đã checkin rồi`, 'warning');
            }
        } catch(error) {
            this.log(`Daily checkin gặp lỗi: ${error.message}`, 'error');
        }
    }

    async getListTask(token, proxy) {
        const headers = {
            ...this.headers,
            "Authorization": token
        }
        try {
            const response = await axios.get("https://pingo.work/api/punny/quests/list", { headers, httpsAgent: new HttpsProxyAgent(proxy) });
            if(response && response.data.code === 200) {
                return response.data.data;
            }
            return [];
        } catch(error) {
            this.log(`Lấy danh sách nhiệm vụ gặp lỗi: ${error.message}`, 'error');
            return [];
        }
    }

    async doTask(token, proxy) {
        const tasks = await this.getListTask(token, proxy);
        if(Array.isArray(tasks) && tasks.length > 0) {
            this.log(`Tìm thấy ${tasks.length} nhiệm vụ, bắt đầu làm...`);
            for(const task of tasks) {
                if(!task.claimed && !task.lock && task.open && task.type === 1) {
                    await this.verifyTask(token, proxy, task);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            this.log(`Đã hoàn thành tất cả các nhiệm vụ...`);
        }
    }
    
    async verifyTask(token, proxy, task) {
        const headers = {
            ...this.headers,
            "Authorization": token
        }
        const payload = {questsId: task.id}
        try {
            const response = await axios.post("https://pingo.work/api/punny/quests/verify", payload, {headers, httpsAgent: new HttpsProxyAgent(proxy) });
            if(response && response.data.code === 200 && response.data.data.verify) {
                this.log(`Đã hoàn thành nhiệm vụ: ${task.id} - ${task.description}...`, 'success');
            }
        } catch(error) {
            this.log(`Làm nhiệm vụ ${task.id} - ${task.description} gặp lỗi: ${error.message}`, 'error');
        }
    }

    async processAccount(queryId, proxy) {
        const token = await this.login(queryId, proxy);
        if(!token) {
            return;
        }
        await this.dailyCheckin(token, proxy);
        await new Promise(resolve => setTimeout(resolve, 2000));
        if(this.config.isDoTask) {
            await this.doTask(token, proxy);
        }
    }

    async main() {
        const data = fs.readFileSync("data.txt", 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
        while (true) {
            for (let i = 0; i < data.length; i++) {
                const queryId = data[i];
                const proxy = this.proxyList[i % this.proxyList.length];
                const userInfo = this.tryGetUserInfo(queryId);
                const proxyIP = await this.checkProxyIP(proxy);
                if(!proxyIP) {
                    continue;
                }
                this.log(`Bắt đầu xử lý tài khoản: ${userInfo.firstName} | IP: ${proxyIP}`);
                await this.processAccount(queryId, proxy);
            }
            this.log(`Đã xử lý hết tất cả các tài khoản, nghỉ 1 lúc nhé`);
            await this.countdown(24* 60 * 60);
        }
    }
}

const client = new PinGo();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});