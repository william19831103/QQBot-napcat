import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface UserCDKey {
  userId: number
  cdkey: string
  timestamp: number
}

export class CDKeyManager {
  private cdkeys: string[] = []
  private usedKeys: UserCDKey[] = []
  private usedKeysFile = path.join(__dirname, 'used_cdkeys.json')

  constructor() {
    // 读取 CDKey 列表
    const cdkeysPath = path.join(__dirname, 'cdkey.txt')
    const content = fs.readFileSync(cdkeysPath, 'utf-8')
    this.cdkeys = content.split('\n').map(key => key.trim()).filter(key => key)

    // 读取已使用的 CDKey 记录
    this.loadUsedKeys()
  }

  private loadUsedKeys() {
    try {
      if (fs.existsSync(this.usedKeysFile)) {
        const content = fs.readFileSync(this.usedKeysFile, 'utf-8')
        this.usedKeys = JSON.parse(content)
      }
    } catch (error) {
      console.error('加载已使用CDKey记录失败:', error)
      this.usedKeys = []
    }
  }

  private saveUsedKeys() {
    try {
      fs.writeFileSync(this.usedKeysFile, JSON.stringify(this.usedKeys, null, 2))
    } catch (error) {
      console.error('保存已使用CDKey记录失败:', error)
    }
  }

  private cleanExpiredKeys() {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    this.usedKeys = this.usedKeys.filter(record => record.timestamp >= today)
    this.saveUsedKeys()
  }

  public canUserGetKey(userId: number): boolean {
    this.cleanExpiredKeys()
    return !this.usedKeys.some(record => record.userId === userId)
  }

  public getNewKey(userId: number): string | null {
    if (!this.canUserGetKey(userId)) {
      return null
    }

    if (this.cdkeys.length === 0) {
      return null
    }

    const cdkey = this.cdkeys.shift() // 获取并移除第一个 CDKey
    if (!cdkey) {
      return null
    }

    // 记录使用记录
    this.usedKeys.push({
      userId,
      cdkey,
      timestamp: Date.now()
    })
    this.saveUsedKeys()

    // 更新 CDKey 文件
    fs.writeFileSync(
      path.join(__dirname, 'cdkey.txt'),
      this.cdkeys.join('\n')
    )

    return cdkey
  }

  public getRemainingCount(): number {
    return this.cdkeys.length
  }

  public addKey(cdkey: string): void {
    // 将卡密添加回可用池中
    this.cdkeys.push(cdkey)
    // 更新 CDKey 文件
    fs.writeFileSync(
      path.join(__dirname, 'cdkey.txt'),
      this.cdkeys.join('\n')
    )
  }

  public getUserKey(userId: number): string | null {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    
    // 查找用户今天使用的卡密
    const userKeyRecord = this.usedKeys.find(record => 
      record.userId === userId && record.timestamp >= today
    )
    
    return userKeyRecord ? userKeyRecord.cdkey : null
  }
} 