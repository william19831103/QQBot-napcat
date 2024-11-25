import { NCWebsocketApi } from '../src/NCWebsocketApi'
import dotenv from 'dotenv'
import fetch from 'node-fetch'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { CDKeyManager } from './CDKeyManager'
import { CooldownManager } from './CooldownManager'
import { KeywordDetector } from './KeywordDetector'
import { OCRManager } from './OCRService'
import { RecallCountManager } from './RecallCountManager'
import { UserRecordManager } from './UserRecordManager'


// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 加载环境变量和关键词配置
dotenv.config()
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'))

// 初始化 CDKey 管理器
const cdkeyManager = new CDKeyManager()

// 初始化冷却管理器（10秒冷却时间）
const cooldownManager = new CooldownManager(10)

// 初始化关键词检测器
const groupKeywordDetector = new KeywordDetector(path.join(__dirname, 'config.json'))

// 初始化OCR管理器
const ocrManager = new OCRManager()

// 初始化撤回次数管理器
const recallCountManager = new RecallCountManager()

// 初始化用户记录管理器
const userRecordManager = new UserRecordManager()

// 检查文本匹配度
function checkTextMatch(text: string): {
  isMatch: boolean,
  matchedWords: string[],
  matchCount: number
} {
  const matchedWords = config.keywords.filter(keyword => 
    text.includes(keyword)
  )

  // 添加调试日志
  console.log('匹配结果:', {
    keywords: config.keywords,
    matchedWords,
    matchCount: matchedWords.length,
    isMatch: matchedWords.length >= config.matchCount
  })

  return {
    isMatch: matchedWords.length >= config.matchCount, // 使用配置中的匹配数量
    matchedWords,
    matchCount: matchedWords.length
  }
}

// 修改 OCR 文字识别函数
async function ocrImage(imageUrl: string): Promise<string> {
  try {
    // 下载图片
    const response = await fetch(imageUrl)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // 使用 OCRManager 进行识别
    const result = await ocrManager.recognize(buffer)
    
    // 直接返回文本（可能为空）
    return result.text || ''
    
  } catch (error) {
    console.error('OCR处理失败:', error)
    return '' // 出错时返回空字符串
  }
}

async function main() {
  const api = new NCWebsocketApi({
    protocol: 'ws',
    host: process.env.WS_HOST ?? '',
    port: Number(process.env.WS_PORT),
    accessToken: process.env.ACCESS_TOKEN
  })

  api.on('meta_event', event => {
    if (event.meta_event_type === 'lifecycle') {
      console.log('连接成功！')
    }
  })

  api.on('message', async event => {
    console.log('收到消息：', event)
    
    // 检查消息是否为空
    if (!event.message || event.message.length === 0) {
      console.log('收到空消息，忽略处理')
      return
    }
    
    // 处理群消息
    if (event.message_type === 'group') {
      try {
        // 获取自己在群里的信息
        const selfInfo = await api.get_group_member_info({
          group_id: event.group_id,
          user_id: Number(process.env.SELF_ID)
        })

        // 检查是否是管理员或群主
        if (selfInfo.role !== 'admin' && selfInfo.role !== 'owner') {
          console.log(`在群 ${event.group_id} 中不是管理员，跳过消息处理`)
          return
        }

        // 检查是否是图片消息
        if (event.message[0]?.type === 'image') {
          const imageUrl = event.message[0].data.url
          const ocrResult = await ocrImage(imageUrl)
          console.log('群图片OCR结果:', ocrResult)

          // 检查OCR结果中是否包含违规内容
          const matchedKeywords = groupKeywordDetector.getMatchedKeywords(ocrResult)
          if (matchedKeywords.length > 0) {
            console.log('群图片匹配到的关键词:', matchedKeywords)

            try {
              // 先撤回消息
              await api.delete_msg({
                message_id: event.message_id
              })
              console.log(`已撤回群 ${event.group_id} 中的图片消息`)

              // 记录撤回并检查是否需要踢出（传入 isImage = true）
              const shouldKick = recallCountManager.addRecall(event.group_id, event.user_id, true)
              const recallCount = recallCountManager.getRecallCount(event.group_id, event.user_id, true)
              const maxRecalls = recallCountManager.getMaxRecalls(true)
              console.log(`用户 ${event.user_id} 在群 ${event.group_id} 的24小时内图片撤回次数: ${recallCount}/${maxRecalls}`)

              if (shouldKick) {
                await api.set_group_kick({
                  group_id: event.group_id,
                  user_id: event.user_id,
                  reject_add_request: false
                })
                console.log(`用户 ${event.user_id} 因24小时内图片被撤回次数过多(${recallCount}/${maxRecalls}次)被踢出群 ${event.group_id}`)
                
                // 记录被踢出的用户
                userRecordManager.recordKick(
                  event.user_id,
                  event.group_id,
                  `图片违规次数过多(${recallCount}/${maxRecalls}次)`
                )
                
                recallCountManager.resetRecalls(event.group_id, event.user_id)
              }
            } catch (error) {
              console.error('处理违规消息时出错:', error)
            }
            return
          }
        }

        // 检查文本消息
        const messageText = event.message.reduce((text, segment) => {
          if (segment.type === 'text') {
            return text + segment.data.text
          }
          return text
        }, '') || event.raw_message || ''

        console.log('群消息内容:', messageText)

        // 如果消息为空，直接返回
        if (!messageText.trim()) {
          console.log('消息内容为空，跳过检查')
          return
        }

        // 检查文本是否违规
        const matchedKeywords = groupKeywordDetector.getMatchedKeywords(messageText)
        if (matchedKeywords.length > 0) {
          console.log('匹配到的关键词:', matchedKeywords)

          try {
            await api.delete_msg({
              message_id: event.message_id
            })
            console.log(`已撤回群 ${event.group_id} 中的消息: ${messageText}`)

            // 记录撤回并检查是否需要踢出（传入 isImage = false）
            const shouldKick = recallCountManager.addRecall(event.group_id, event.user_id, false)
            const recallCount = recallCountManager.getRecallCount(event.group_id, event.user_id, false)
            const maxRecalls = recallCountManager.getMaxRecalls(false)
            console.log(`用户 ${event.user_id} 在群 ${event.group_id} 的24小时内文本撤回次数: ${recallCount}/${maxRecalls}`)

            if (shouldKick) {
              await api.set_group_kick({
                group_id: event.group_id,
                user_id: event.user_id,
                reject_add_request: false
              })
              console.log(`用户 ${event.user_id} 因24小时内文本被撤回次数过多(${recallCount}/${maxRecalls}次)被踢出群 ${event.group_id}`)
              
              // 记录被踢出的用户
              userRecordManager.recordKick(
                event.user_id,
                event.group_id,
                `文本违规次数过多(${recallCount}/${maxRecalls}次)`
              )
              
              recallCountManager.resetRecalls(event.group_id, event.user_id)
            }
          } catch (error) {
            console.error('处理违规消息时出错:', error)
          }
        }

      } catch (error) {
        console.error(`群 ${event.group_id} 消息处理错误:`, error)
      }
    }

    if (event.message_type === 'private') {
      // 检查用户是否在冷却中
      if (!cooldownManager.canSendMessage(event.user_id)) {
        return
      }

      // 检查是否是管理员命令
      if (event.message[0]?.type === 'text' && event.message[0].data.text === '/rl') {
        groupKeywordDetector.loadKeywords()
        api.send_private_msg({
          user_id: event.user_id,
          message: [{ 
            type: 'text', 
            data: { text: `关键词重载成功！当前关键词：${groupKeywordDetector.getCurrentKeywords().join(', ')}` }
          }]
        })
        // 更新用户的冷却时间
        cooldownManager.updateLastSendTime(event.user_id)
        return
      }

      // 检查是否是图片消息
      if (event.message[0]?.type !== 'image') {
        api.send_private_msg({
          user_id: event.user_id,
          message: [{ 
            type: 'text', 
            data: { text: '欢迎领取每日宣传，请发送游戏截图进行给我验证，截图内宣传内容文字要清晰！' }
          }]
        })
        // 更新用户的冷却时间
        cooldownManager.updateLastSendTime(event.user_id)
        return
      }

      // 首先检查用户是否已经领取过 CDKey
      if (!cdkeyManager.canUserGetKey(event.user_id)) {
        const userKey = cdkeyManager.getUserKey(event.user_id)
        
        api.send_private_msg({
          user_id: event.user_id,
          message: [{ 
            type: 'text', 
            data: { 
              text: `您今天已经领取过卡密了：${userKey}。每日一次，请明天再来！每日午夜12点刷新！` 
            }
          }]
        })
        // 更新用户的冷却时间
        cooldownManager.updateLastSendTime(event.user_id)
        return
      }

      // 检查是否还有可用的 CDKey
      if (cdkeyManager.getRemainingCount() === 0) {
        api.send_private_msg({
          user_id: event.user_id,
          message: [{ 
            type: 'text', 
            data: { text: '抱歉，卡密已经发完了！请联系老G！' }
          }]
        })
        // 更新用户的冷却时间
        cooldownManager.updateLastSendTime(event.user_id)
        return
      }

      // 用户未领取且有可用卡密，进行图片识别
      const imageUrl = event.message[0].data.url
      const ocrResult = await ocrImage(imageUrl)
      const matchResult = checkTextMatch(ocrResult)
      
      if (matchResult.isMatch) {
        const cdkey = cdkeyManager.getNewKey(event.user_id)
        
        if (!cdkey) {
          api.send_private_msg({
            user_id: event.user_id,
            message: [{ 
              type: 'text', 
              data: { text: '抱歉，卡密已经发完了！请联系管理员。' }
            }]
          })
          // 更新用户的冷却时间
          cooldownManager.updateLastSendTime(event.user_id)
          return
        }

        api.send_private_msg({
          user_id: event.user_id,
          message: [{
            type: 'text',
            data: {
              text: `验证成功！您的卡密是：${cdkey} 。使用说明：请在游戏内，使用宣传手册，点击兑换卡密领取奖励！`
            }
          }]
        })
      } else {
        api.send_private_msg({
          user_id: event.user_id,
          message: [{ 
            type: 'text', 
            data: { text: '图片验证失败，请确保截图包含以下内容清晰可见！' }
          }]
        })
      }
      // 更新用户的冷却时间
      cooldownManager.updateLastSendTime(event.user_id)
    }
  })

  await api.connect()
}

// 修改这里：添加 catch 处理
main().catch(error => {
  console.error('程序运行出错:', error)
  process.exit(1)
})