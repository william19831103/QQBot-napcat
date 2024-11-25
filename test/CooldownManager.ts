export class CooldownManager {
  private userCooldowns: Map<number, number> = new Map()
  private cooldownTime: number // 冷却时间（毫秒）

  constructor(cooldownSeconds: number) {
    this.cooldownTime = cooldownSeconds * 1000
  }

  public canSendMessage(userId: number): boolean {
    const lastMessageTime = this.userCooldowns.get(userId)
    if (!lastMessageTime) {
      return true
    }

    const now = Date.now()
    return (now - lastMessageTime) >= this.cooldownTime
  }

  public setLastMessageTime(userId: number) {
    this.userCooldowns.set(userId, Date.now())
  }

  public getRemainingTime(userId: number): number {
    const lastMessageTime = this.userCooldowns.get(userId)
    if (!lastMessageTime) {
      return 0
    }

    const now = Date.now()
    const elapsed = now - lastMessageTime
    const remaining = this.cooldownTime - elapsed

    return remaining > 0 ? Math.ceil(remaining / 1000) : 0
  }
} 