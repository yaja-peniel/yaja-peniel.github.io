// 야자 관리실 깨우기 장치 (Arduino Uno 기준)
//
// PC의 Chrome·Edge에서 앱 설정 → 카메라 관리 → '아두이노 연결'을 누르면,
// 앱이 USB 시리얼(9600bps)로 아래 글자 하나를 보냅니다.
//   W : 졸음 감지 → 진동 모터와 부저로 깨우기 (O를 받거나 20초가 지나면 멈춤)
//   O : 깨우기 멈춤 ("깼어요" 버튼)
//   S : 공부 시작 → 초록 LED 켜기
//   B : 휴식 → 노란 LED 켜기
//   E : 공부 끝 → LED 끄기
//
// 회로
//  - 진동 모터(3~5V 코인형 등): 아두이노 핀은 권장 20mA(최대 40mA)까지라 모터를 직접 연결하면 안 됩니다.
//      9번 핀 → 1kΩ 저항 → NPN 트랜지스터(2N2222 등) 베이스
//      5V → 모터 → 트랜지스터 컬렉터,  트랜지스터 이미터 → GND
//      모터 양 끝에 다이오드(1N4148 또는 1N4007)를 역방향으로 병렬 연결 (줄무늬 쪽이 5V 쪽) → 모터가 멈출 때 생기는 역기전력으로부터 트랜지스터를 보호
//  - 부저(수동형): 8번 핀 → 부저(+) / 부저(-) → GND
//  - 초록 LED: 6번 핀 → 220Ω → LED → GND,  노란 LED: 7번 핀 → 220Ω → LED → GND

const int MOTOR_PIN = 9;
const int BUZZER_PIN = 8;
const int GREEN_PIN = 6;
const int YELLOW_PIN = 7;
const unsigned long WAKE_MAX_MS = 20000UL; // 깨우기는 최대 20초
const unsigned long PULSE_MS = 400UL;      // 0.4초 간격으로 켰다 껐다

bool waking = false;
bool pulseOn = false;
unsigned long wakeStart = 0;
unsigned long lastPulse = 0;

void setup() {
  Serial.begin(9600);
  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(YELLOW_PIN, OUTPUT);
  stopWake();
  setLeds(false, false);
}

void loop() {
  while (Serial.available() > 0) {
    handle((char)Serial.read());
  }
  if (waking) {
    unsigned long now = millis();
    if (now - wakeStart >= WAKE_MAX_MS) {
      stopWake();
    } else if (now - lastPulse >= PULSE_MS) {
      lastPulse = now;
      pulseOn = !pulseOn;
      digitalWrite(MOTOR_PIN, pulseOn ? HIGH : LOW);
      if (pulseOn) tone(BUZZER_PIN, 1500, 250);
    }
  }
}

void handle(char c) {
  switch (c) {
    case 'W': waking = true; wakeStart = millis(); lastPulse = 0; pulseOn = false; break;
    case 'O': stopWake(); break;
    case 'S': setLeds(true, false); break;
    case 'B': setLeds(false, true); break;
    case 'E': stopWake(); setLeds(false, false); break;
    default: break; // 줄바꿈 등 다른 글자는 무시
  }
}

void stopWake() {
  waking = false;
  pulseOn = false;
  digitalWrite(MOTOR_PIN, LOW);
  noTone(BUZZER_PIN);
}

void setLeds(bool green, bool yellow) {
  digitalWrite(GREEN_PIN, green ? HIGH : LOW);
  digitalWrite(YELLOW_PIN, yellow ? HIGH : LOW);
}
