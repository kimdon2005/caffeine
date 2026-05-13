const DRINKS = [
  { id: "monster-white", name: "몬스터 흰색 355mL", caffeinePerMl: 100 / 355, defaultMl: 355, note: "제품 표시 100mg 기준" },
  { id: "energy", name: "일반 에너지음료", caffeinePerMl: 80 / 250, defaultMl: 250, note: "질병관리청 예시 250mL 80mg" },
  { id: "coffee-bottle", name: "커피음료", caffeinePerMl: 103 / 250, defaultMl: 250, note: "질병관리청 예시 250mL 103mg" },
  { id: "cafe-coffee", name: "전문점 커피/아메리카노", caffeinePerMl: 132 / 400, defaultMl: 400, note: "질병관리청 예시 400mL 132mg" },
  { id: "coffee-milk", name: "커피우유", caffeinePerMl: 47 / 200, defaultMl: 200, note: "질병관리청 예시 200mL 47mg" },
  { id: "mix", name: "커피믹스", caffeinePerMl: null, defaultMl: 1, fixedMg: 56, unit: "봉", note: "질병관리청 예시 1봉 56mg" },
  { id: "green-tea", name: "녹차 티백", caffeinePerMl: null, defaultMl: 1, fixedMg: 22, unit: "개", note: "질병관리청 예시 티백 1개 22mg" },
  { id: "custom", name: "직접 입력", caffeinePerMl: null, defaultMl: 250, custom: true, note: "제품 표시를 직접 입력" },
];

const state = {
  drinks: [],
};

const $ = (id) => document.getElementById(id);

function init() {
  const select = $("drinkType");
  DRINKS.forEach((drink) => {
    const option = document.createElement("option");
    option.value = drink.id;
    option.textContent = drink.name;
    select.appendChild(option);
  });

  select.addEventListener("change", syncDrinkFields);
  $("addDrink").addEventListener("click", addDrink);
  $("analyze").addEventListener("click", analyze);
  $("reset").addEventListener("click", resetAll);
  $("copyPrompt").addEventListener("click", copyPrompt);
  syncDrinkFields();
  renderDrinkList();
}

function selectedDrink() {
  return DRINKS.find((drink) => drink.id === $("drinkType").value);
}

function syncDrinkFields() {
  const drink = selectedDrink();
  $("drinkMl").value = drink.defaultMl;
  $("customCaffeineWrap").classList.toggle("hidden", !drink.custom);
  const unitLabel = $("drinkMl").nextElementSibling;
  unitLabel.textContent = drink.unit || "mL";
}

function estimateDrinkMg(drink, amount, count, customMg) {
  if (drink.custom) return Number(customMg || 0) * count;
  if (drink.fixedMg) return drink.fixedMg * count;
  return drink.caffeinePerMl * amount * count;
}

function addDrink() {
  const drink = selectedDrink();
  const amount = Number($("drinkMl").value || 0);
  const count = Number($("drinkCount").value || 0);
  const customMg = Number($("customCaffeine").value || 0);

  if (!drink || amount <= 0 || count <= 0) {
    addBubble("bot warn", "음료 종류, 용량, 횟수를 확인해 주세요.");
    return;
  }

  if (drink.custom && customMg <= 0) {
    addBubble("bot warn", "직접 입력은 1회 기준 카페인 mg을 입력해야 계산할 수 있어요.");
    return;
  }

  const totalMg = estimateDrinkMg(drink, amount, count, customMg);
  state.drinks.push({
    name: drink.name,
    amount,
    count,
    totalMg,
    note: drink.note,
    unit: drink.unit || "mL",
  });

  renderDrinkList();
}

function renderDrinkList() {
  const list = $("drinkList");
  list.innerHTML = "";

  if (!state.drinks.length) {
    const empty = document.createElement("div");
    empty.className = "drink-row";
    empty.innerHTML = "<span>아직 추가한 음료가 없습니다.</span><span>-</span>";
    list.appendChild(empty);
    return;
  }

  state.drinks.forEach((drink, index) => {
    const row = document.createElement("div");
    row.className = "drink-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(drink.name)}</strong>
        <span>${drink.amount}${drink.unit} x ${drink.count}회 · ${escapeHtml(drink.note)}</span>
      </div>
      <strong>약 ${Math.round(drink.totalMg)}mg</strong>
      <button type="button" aria-label="삭제" data-index="${index}">×</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      state.drinks.splice(index, 1);
      renderDrinkList();
    });
    list.appendChild(row);
  });
}

function analyze() {
  const weight = Number($("weight").value || 0);
  if (!weight) {
    addBubble("bot warn", "체중을 입력해야 청소년 권고량(체중 x 2.5mg)을 계산할 수 있어요.");
    return;
  }

  if (!state.drinks.length) {
    addBubble("bot warn", "최근 1주일 동안 마신 카페인 음료를 하나 이상 추가해 주세요.");
    return;
  }

  const totalWeekly = state.drinks.reduce((sum, drink) => sum + drink.totalMg, 0);
  const avgDaily = totalWeekly / 7;
  const limit = weight * 2.5;
  const ratio = avgDaily / limit;
  const time = $("time").value;
  const reason = $("reason").value;
  const symptoms = $("symptoms").value.trim();
  const sleepNormal = Number($("sleepNormal").value || 0);
  const sleepExam = Number($("sleepExam").value || 0);
  const exam = $("exam").value;
  const risk = getRisk(ratio, time, symptoms, sleepExam || sleepNormal);

  $("avgMg").textContent = `약 ${Math.round(avgDaily)}mg`;
  $("limitMg").textContent = `약 ${Math.round(limit)}mg`;
  $("riskLabel").textContent = risk.label;

  $("chat").innerHTML = "";
  addBubble("user", buildUserSummary(avgDaily, limit, time, reason, symptoms));
  addBubble(`bot ${risk.className}`, buildCoachMessage({ avgDaily, limit, ratio, time, reason, symptoms, sleepNormal, sleepExam, exam, risk }));
  addBubble("bot", buildPlan(reason, time, symptoms));

  $("promptOutput").value = buildPrompt({ weight, avgDaily, limit, time, reason, symptoms, sleepNormal, sleepExam, exam });
}

function getRisk(ratio, time, symptoms, sleepHours) {
  if (symptoms.match(/흉통|가슴통증|심한|호흡|기절/) || ratio >= 1.2) {
    return { label: "주의 필요", className: "danger" };
  }
  if (ratio >= 0.8 || time === "밤 10시 이후" || sleepHours < 6 || symptoms) {
    return { label: "조절 권장", className: "warn" };
  }
  return { label: "낮은 편", className: "" };
}

function buildUserSummary(avgDaily, limit, time, reason, symptoms) {
  return `
    <strong>내 입력 요약</strong>
    <p>하루 평균 카페인은 약 ${Math.round(avgDaily)}mg, 내 권고량은 약 ${Math.round(limit)}mg입니다. 주로 ${time}에 마시고, 이유는 ${reason}입니다.${symptoms ? ` 선택 입력 증상은 “${escapeHtml(symptoms)}”입니다.` : ""}</p>
  `;
}

function buildCoachMessage(data) {
  const percent = Math.round(data.ratio * 100);
  const items = [];
  items.push(`현재 추정 섭취량은 권고량의 약 ${percent}%입니다.`);

  if (data.ratio >= 1) {
    items.push("권고량을 넘었거나 거의 넘는 수준이라, 먼저 양과 횟수를 줄이는 것이 좋습니다.");
  } else if (data.ratio >= 0.8) {
    items.push("권고량에 가까워지고 있어 시험 기간에는 쉽게 초과할 수 있습니다.");
  } else {
    items.push("양만 보면 높지 않을 수 있지만, 시간대와 수면 상태도 함께 봐야 합니다.");
  }

  if (data.time === "밤 10시 이후") {
    items.push("밤 10시 이후 섭취는 잠드는 시간을 늦추고 다음날 피로를 키울 수 있습니다.");
  }

  if (data.sleepExam && data.sleepExam < 6) {
    items.push("시험 기간 수면 시간이 6시간 미만이면 카페인보다 수면 회복 계획이 우선입니다.");
  }

  if (data.symptoms) {
    items.push("입력한 증상이 반복되면 카페인 섭취를 줄이고 보건교사나 의료 전문가에게 상담하세요.");
  }

  return `
    <strong>카페인 코치</strong>
    <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
}

function buildPlan(reason, time, symptoms) {
  const plan = [];
  if (time === "밤 10시 이후") {
    plan.push("1주일 동안 밤 10시 이후에는 카페인 음료를 마시지 않기");
  } else {
    plan.push("카페인 음료를 마시는 시간을 오후 늦게보다 앞 시간대로 당기기");
  }

  if (reason === "졸려서" || reason === "시험공부") {
    plan.push("졸릴 때 바로 카페인을 마시기 전 물 마시기와 10분 걷기를 먼저 하기");
  } else if (reason === "맛" || reason === "습관") {
    plan.push("같은 맛을 원할 때는 무카페인 탄산수나 물로 한 번 대체하기");
  } else {
    plan.push("카페인을 찾는 상황을 기록하고, 그 전에 할 수 있는 대체 행동 하나 정하기");
  }

  plan.push("마신 음료, 시간, 수면 시간을 1주일 동안 간단히 기록하기");

  return `
    <strong>1주일 실천 계획</strong>
    <ul>${plan.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <p>${symptoms ? "증상이 지속되면 혼자 버티지 말고 상담을 받는 것이 좋습니다." : "증상이 없다면 기록을 통해 시간대와 습관부터 조정해 보세요."}</p>
  `;
}

function buildPrompt(data) {
  const drinkRecords = state.drinks
    .map((drink) => `- ${drink.name}: ${drink.amount}${drink.unit} x ${drink.count}회, 추정 ${Math.round(drink.totalMg)}mg (${drink.note})`)
    .join("\n");

  return `너의 역할은 청소년의 카페인 섭취 습관을 점검해 주는 건강 습관 코치야.
목표는 내가 입력한 음료 종류와 용량을 바탕으로 하루 평균 카페인 섭취량을 추정하고, 청소년 권고량과 비교해서 무리하지 않고 실천 가능한 개선안을 제안하는 거야.

주의할 점:
- 정확한 함량을 모르면 “추정치”라고 표시해 줘.
- 증상은 선택 입력이므로, 비어 있으면 증상 분석은 생략해 줘.
- 답변은 의료 진단이 아니라 생활습관 조언으로 해 줘.
- 심한 두근거림, 불면, 불안, 흉통 같은 증상이 계속되면 보건교사나 의료 전문가에게 상담하라고 알려 줘.

내 정보:
1. 학년/상황: 고등학생, 시험 기간 여부는 ${data.exam}
2. 체중: ${data.weight}kg
3. 평소 수면 시간: ${data.sleepNormal || "미입력"}시간
4. 시험 기간 수면 시간: ${data.sleepExam || "미입력"}시간
5. 최근 1주일 동안 마신 카페인 음료:
${drinkRecords}
6. 주로 마신 시간대: ${data.time}
7. 마신 이유: ${data.reason}
8. 카페인 함량 표시 확인 여부: ${$("labelCheck").value}
9. 선택 입력 - 마신 뒤 증상: ${data.symptoms || "없음/미입력"}

위 내용을 바탕으로 아래 형식으로 답해 줘.
1. 내 하루 평균 카페인 섭취량 추정
2. 청소년 권고량(체중 x 2.5mg)과 비교
3. 가장 조심해야 할 섭취 시간대
4. 내가 카페인을 찾는 가장 큰 이유 분석
5. 오늘부터 할 수 있는 1주일 실천 계획 3가지
6. 카페인 대신 사용할 수 있는 대체 행동 3가지`;
}

function addBubble(className, html) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${className}`;
  bubble.innerHTML = html;
  $("chat").appendChild(bubble);
  $("chat").scrollTop = $("chat").scrollHeight;
}

async function copyPrompt() {
  const text = $("promptOutput").value;
  if (!text) {
    addBubble("bot warn", "먼저 상담 받기를 눌러 프롬프트를 생성해 주세요.");
    return;
  }

  await navigator.clipboard.writeText(text);
  $("copyPrompt").textContent = "복사됨";
  setTimeout(() => {
    $("copyPrompt").textContent = "프롬프트 복사";
  }, 1400);
}

function resetAll() {
  state.drinks = [];
  ["weight", "sleepNormal", "sleepExam", "symptoms", "promptOutput"].forEach((id) => {
    $(id).value = "";
  });
  $("exam").value = "아니오";
  $("time").value = "등교 전";
  $("reason").value = "졸려서";
  $("labelCheck").value = "확인하지 않음";
  $("avgMg").textContent = "-";
  $("limitMg").textContent = "-";
  $("riskLabel").textContent = "입력 전";
  $("chat").innerHTML = `
    <div class="bubble bot">
      <strong>카페인 코치</strong>
      <p>왼쪽에 최근 1주일 동안 마신 음료를 입력하면 카페인 섭취량을 추정하고 실천 계획을 제안할게요.</p>
    </div>
  `;
  renderDrinkList();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
