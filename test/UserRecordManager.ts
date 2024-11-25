import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface KickRecord {
  userId: number
  groupId: number
  time: string
  reason: string
}

export class UserRecordManager {
  private readonly logFile: string
  
  constructor() {
    this.logFile = path.join(__dirname, 'kicked_users.txt')
    this.ensureLogFile()
  }

  private ensureLogFile(): void {
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '被踢出用户记录：\n', 'utf-8')
    }
  }

  public recordKick(userId: number, groupId: number, reason: string): void {
    const record: KickRecord = {
      userId,
      groupId,
      time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      reason
    }

    const logMessage = `[${record.time}] 用户 ${record.userId} 被踢出群 ${record.groupId}，原因：${record.reason}\n`
    
    try {
      fs.appendFileSync(this.logFile, logMessage, 'utf-8')
      console.log('记录踢出用户信息成功:', logMessage.trim())
    } catch (error) {
      console.error('记录踢出用户信息失败:', error)
    }
  }
} 