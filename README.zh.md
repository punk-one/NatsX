# NatsX

[English](README.md) | [绠€浣撲腑鏂嘳(README.zh.md)

NatsX 鏄竴涓潰鍚?`NATS / JetStream` 鐨勬闈㈠鎴风锛屽熀浜?`Go + Wails + React + Ant Design` 鏋勫缓锛岃仛鐒﹁繛鎺ョ鐞嗐€佽闃呫€佹秷鎭彂閫併€乣Request / Reply` 璋冭瘯銆丣etStream 宸ヤ綔娴佷笌鏈湴鎸佷箙鍖栥€?
- 鐗堟湰锛歚1.0.3`
- 浣滆€咃細`punk-one`
- 浠撳簱鍦板潃锛歔https://github.com/punk-one/NatsX](https://github.com/punk-one/NatsX)
- Releases锛歔https://github.com/punk-one/NatsX/releases](https://github.com/punk-one/NatsX/releases)
- 璁稿彲璇侊細`Apache License 2.0`

## 棰勮

![NatsX Screenshot](docs/screenshot.png)

## 鍔熻兘鐗规€?
### 杩炴帴绠＄悊

- 鏀寔杩炴帴鐨勬柊寤恒€佺紪杈戙€佸垹闄ゃ€佸垎缁勩€佸鍏ヤ笌瀵煎嚭
- 鏀寔 `No Auth`銆乣Username / Password`銆乣Token`銆乣TLS / mTLS`銆乣NKey` 涓?`Credentials`
- 鏀寔澶嶇敤宸蹭笂浼犵殑璇佷功銆佺閽ャ€丆A 涓庡嚟鎹枃浠?- 鍚姩鏃惰嚜鍔ㄦ仮澶嶅凡淇濆瓨鐨勮繛鎺ヤ笌搴旂敤璁剧疆

### 娑堟伅宸ヤ綔娴?
- 璁㈤槄 Subject 骞跺疄鏃舵煡鐪嬫秷鎭祦
- 鏀寔甯?Headers 鐨勬秷鎭彂閫佷笌杞借嵎鏍煎紡鍖?- 鏀寔 `JSON`銆乣Text`銆乣Hex`銆乣Base64`銆乣CBOR`銆乣MsgPack` 绛夎浇鑽疯鍥?- 淇濆瓨鏈€杩戝彂閫佽褰曪紝渚夸簬蹇€熼噸鏀句笌澶嶇敤

### Request / Reply

- 鏀寔甯﹁秴鏃舵帶鍒剁殑璇锋眰鍙戦€?- 骞舵帓瀵规瘮鍘熷璇锋眰銆侀噸鏀捐姹備笌鍝嶅簲缁撴灉
- 璺熻釜璇锋眰 ID銆佽€楁椂涓庡叧鑱旀秷鎭?
### JetStream

- 娴忚 Streams 涓?Consumers
- 鏂板缓銆佹洿鏂般€佸垹闄?Stream / Consumer 閰嶇疆
- 浠?Pull Consumer 涓诲姩鎶撳彇娑堟伅
- 鍦ㄦ闈㈢晫闈腑鎵ц `Ack`銆乣Nak`銆乣Term`

### 鎸佷箙鍖栦笌鍙戝竷

- 灏嗚缃€佽繛鎺ャ€佸崌绾х姸鎬佷笌鏃ュ織缁熶竴淇濆瓨鍒?`database/natsx.db`
- 灏嗕笂浼犵殑 credentials 涓?TLS 鐩稿叧璧勬簮淇濆瓨鍒板簲鐢ㄦ湰鍦扮洰褰?- 鏀寔鍩轰簬 GitHub Releases 鐨勬洿鏂版鏌ヤ笌鎵嬪姩鍗囩骇
- 鍚屾椂鍙戝竷 `windows-amd64` 涓?`linux-amd64` 涓や釜骞冲彴渚挎惡鍖?
## 鏋勫缓

### Windows

```powershell
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 build -nosyncgomod -m
```

### Linux

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 build -nosyncgomod -m -platform linux/amd64 -nopackage -tags webkit2_41 -o NatsX
```

## `v1.0.3` 鍙戝竷璧勪骇

- `NatsX-1.0.3-windows-amd64.zip`
- `NatsX-1.0.3-windows-amd64.sha256.txt`
- `NatsX-1.0.3-linux-amd64.tar.gz`
- `NatsX-1.0.3-linux-amd64.sha256.txt`
- `SHA256SUMS`
- `latest.json`

## 璁稿彲璇?
椤圭洰鍩轰簬 `Apache License 2.0` 鍙戝竷锛岃瑙?`LICENSE`銆?
