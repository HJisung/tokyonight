---
name: tokyonight (가칭)
description: 로컬 파일 메모 앱의 디자인 기준. 종이 면 위에 블루블랙 잉크 하나.
colors:
  paper: "oklch(0.99 0.002 260)"
  shell: "oklch(0.962 0.006 260)"
  shell-hover: "oklch(0.925 0.01 260)"
  fill: "oklch(0.94 0.008 260)"
  rule: "oklch(0.885 0.008 260)"
  ink-text: "oklch(0.22 0.02 262)"
  ink-muted: "oklch(0.5 0.02 262)"
  ink: "oklch(0.38 0.11 262)"
  on-ink: "oklch(0.985 0.003 260)"
  focus: "oklch(0.55 0.13 262)"
  selection: "oklch(0.38 0.11 262 / 20%)"
  danger: "oklch(0.55 0.2 27)"
  paper-dark: "oklch(0.2 0.012 262)"
  raised-dark: "oklch(0.235 0.013 262)"
  shell-dark: "oklch(0.165 0.012 262)"
  shell-hover-dark: "oklch(0.24 0.015 262)"
  fill-dark: "oklch(0.26 0.015 262)"
  rule-dark: "oklch(0.3 0.015 262)"
  ink-text-dark: "oklch(0.93 0.008 260)"
  ink-muted-dark: "oklch(0.7 0.02 262)"
  ink-dark: "oklch(0.78 0.1 258)"
  on-ink-dark: "oklch(0.18 0.02 262)"
  focus-dark: "oklch(0.65 0.12 260)"
  selection-dark: "oklch(0.78 0.1 258 / 28%)"
  danger-dark: "oklch(0.7 0.18 22)"
typography:
  title:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.33
  body:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Malgun Gothic, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  mono:
    fontFamily: "ui-monospace, SF Mono, Cascadia Mono, Consolas, Apple SD Gothic Neo, Malgun Gothic, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
rounded:
  sm: "0.225rem"
  md: "0.3rem"
  lg: "0.375rem"
spacing:
  "1": "0.25rem"
  "1.5": "0.375rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "6": "1.5rem"
  bar: "2.5rem"
components:
  top-bar:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.ink-text}"
    height: "{spacing.bar}"
    padding: "0 0.375rem"
  sidebar:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.ink-text}"
    width: "264px"
  sidebar-resizer:
    backgroundColor: "{colors.rule}"
    width: "1px"
  sidebar-resizer-hover:
    backgroundColor: "{colors.focus}"
  sidebar-resizer-dragging:
    backgroundColor: "{colors.ink}"
  button-icon-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.md}"
    size: "1.75rem"
  button-icon-ghost-hover:
    backgroundColor: "{colors.fill}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  placeholder:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
---

# Design System: tokyonight (가칭)

토큰의 실제 정의는 [`src/styles/theme.css`](src/styles/theme.css)입니다. 위 frontmatter와 값이 다르면 `theme.css`가 맞고, 이 문서를 고쳐야 합니다. 화면 배치와 단축키는 [`docs/design/screens.md`](docs/design/screens.md), 제품 사실은 [`PRODUCT.md`](PRODUCT.md)에 있습니다.

> **가정.** 이 방향은 T-010에서 사용자 확인 없이 구현자가 정했습니다(검토는 MVP 완성 뒤). 검토한 다른 후보는 '견출지'(워크스페이스마다 색 띠), '모눈 공책'(괘선과 모눈, 붉은 강조), '카테고리 표준'(중성 회색에 강조색 하나)이었습니다. 방향을 바꾸면 `theme.css`의 색 값과 이 문서만 고치면 되고, 컴포넌트는 토큰 이름만 쓰므로 그대로 둘 수 있습니다.

## Overview

**Creative North Star: "잉크와 종이"**

문서가 놓이는 면은 깨끗한 종이이고, 그 둘레의 사이드바와 위쪽 줄은 종이를 올려 둔 책상처럼 한 단계 가라앉은 면입니다. 색은 블루블랙 잉크 하나뿐이며, 그 잉크는 "지금 여기"를 표시할 때만 씁니다. 사용자는 한 폴더의 문서를 여러 개 띄워 놓고 오래 읽고 고치는 사람이므로, 화면은 문서를 방해하지 않고 어느 워크스페이스·어느 영역에 있는지만 분명히 알려 줍니다.

모든 중성색은 순수한 회색이 아니라 잉크 색조(oklch hue 260 근처)로 아주 살짝 물들어 있습니다. 그래서 라이트에서는 흰 종이에 푸른 기가 도는 검정 글씨로, 다크에서는 먹색 종이에 밝은 잉크로 읽힙니다. 누런 종이색이나 장식적인 질감은 쓰지 않습니다.

라이트와 다크는 같은 구조의 두 벌입니다. 기본은 OS 설정을 따릅니다. 낮에 밝은 방에서는 라이트, 밤에 어두운 방에서 다른 어두운 창들 옆에 둘 때는 다크를 쓰는 사용 장면을 둘 다 지원합니다.

**Key Characteristics:**

- 면은 두 단계뿐입니다: 종이(본문)와 껍데기(사이드바, 위쪽 줄).
- 색은 잉크 하나. 장식에는 쓰지 않습니다.
- 영역은 그림자가 아니라 1px 괘선으로 나눕니다.
- 촘촘하지만 답답하지 않은 밀도: 위쪽 줄 40px, 아이콘 버튼 28px, UI 글자 14px.
- 움직임은 상태 변화에만, 짧게.

## Colors

잉크 색조로 물들인 중성색 위에 블루블랙 잉크 하나를 올린 절제된 팔레트입니다. 아래 이름 옆 괄호는 `theme.css`의 토큰입니다. 값은 frontmatter에 있습니다(다크는 `-dark`가 붙은 항목).

### Primary

- **블루블랙 잉크** (`primary`, frontmatter `ink` / `ink-dark`): 주 동작 버튼, 현재 선택, 활성 워크스페이스 탭과 포커스된 분할 영역의 표시 선, 끌고 있는 경계선, 글자 커서. 라이트에서는 짙은 남색, 다크에서는 같은 색조의 밝은 파랑입니다.
- **포커스** (`ring`, `focus`): 키보드 포커스 링과 경계선에 마우스를 올렸을 때. 잉크보다 한 단계 밝습니다.
- **선택 영역** (`selection`): 글자를 드래그해 선택했을 때의 배경. 잉크를 옅게 깐 색입니다.

### Neutral

- **종이** (`background`, `paper`): 문서가 놓이는 본문 면.
- **껍데기** (`sidebar`, `shell`): 사이드바와 위쪽 줄. 라이트에서는 종이보다 조금 어둡고, 다크에서는 종이보다 더 어둡습니다. 두 테마 모두 본문이 가장 밝은 면입니다.
- **껍데기 위 강조 면** (`sidebar-accent`, `shell-hover`): 사이드바 안에서 마우스를 올린 줄, 선택된 줄의 배경.
- **채움** (`muted`·`secondary`·`accent`, `fill`): 종이 위에서 마우스를 올린 버튼, 보조 버튼의 배경.
- **떠 있는 면** (`card`·`popover`, 다크에서 `raised-dark`): 메뉴, 대화상자. 라이트에서는 종이와 같고 다크에서는 종이보다 한 단계 밝습니다.
- **괘선** (`border`·`input`, `rule`): 영역 사이의 선, 입력란 테두리.
- **글자** (`foreground`, `ink-text`): 본문과 UI 글자.
- **흐린 글자** (`muted-foreground`, `ink-muted`): 안내 문구, 보조 정보. 종이와 껍데기 양쪽에서 대비 4.5:1 이상입니다.

### Semantic

- **위험** (`destructive`, `danger`): 오류 문구, 삭제처럼 되돌리기 어려운 동작. 잉크와 혼동되지 않는 붉은색입니다.

경고·성공·정보 색은 아직 쓰는 곳이 없어 정하지 않았습니다. 필요해지는 task(예: 외부 변경 충돌)에서 추가합니다.

### Named Rules

**잉크 하나 규칙.** 색이 있는 것은 잉크뿐이고, 잉크는 주 동작·현재 선택·포커스 위치에만 씁니다. 꾸미려고 쓰지 않습니다. 한 화면에서 잉크가 칠해진 면적이 넓어지면 무언가 잘못된 것입니다.

**회색 금지 규칙.** 채도가 0인 회색을 쓰지 않습니다. 새 중성색이 필요하면 hue 260 근처에서 채도 0.002~0.02로 만듭니다.

**본문이 가장 밝다 규칙.** 라이트든 다크든 문서 면이 화면에서 가장 밝은 면입니다. 껍데기를 본문보다 밝게 만들지 않습니다.

## Typography

**UI 글꼴:** Geist Variable. 한글은 OS 글꼴로 넘어갑니다(macOS Apple SD Gothic Neo, Windows 맑은 고딕).
**고정폭 글꼴:** OS 기본 고정폭(SF Mono, Cascadia Mono, Consolas). 코드 블록과 원문 모드용입니다.

**Character:** 한 가지 산세리프로 제목, 버튼, 목록, 안내 문구를 모두 처리합니다. 글꼴이 아니라 굵기와 흐린 글자색으로 위계를 만듭니다.

> 가정: 새 글꼴 패키지를 추가하지 않았습니다. 그래서 한글 모양이 macOS와 Windows에서 서로 다릅니다. 두 OS에서 같게 보이게 하려면 Pretendard 같은 한글 글꼴을 추가하는 방법이 있고, 이는 새 의존성이라 사용자 승인이 필요합니다. 문서 본문(편집기)의 글꼴과 크기는 편집기 task(T-024, T-030)에서 정합니다.

### Hierarchy

- **Title** (500, 1.5rem, `text-2xl font-medium`): 빈 화면이나 시작 화면의 제목. 한 화면에 하나.
- **Body** (400, 0.875rem, `text-sm`): UI의 기본 글자. 파일 목록, 탭, 버튼, 안내 문구.
- **Label** (500, 0.75rem, `text-xs`): 작은 버튼, 단축키 표시, 보조 정보.
- **Mono** (400, 0.875rem, `font-mono`): 코드, 원문 모드, 파일 경로.

크기는 rem 고정 단계만 쓰고 화면 너비에 따라 바꾸지 않습니다.

### Named Rules

**고정폭은 코드에만 규칙.** 고정폭 글꼴은 코드, 원문, 경로처럼 글자 폭이 의미가 있는 곳에만 씁니다. "기술적인 느낌"을 내려고 쓰지 않습니다.

## Layout

창 하나를 세 영역으로 나눕니다: 창 너비 전체의 위쪽 줄(높이 2.5rem), 그 아래 왼쪽의 사이드바, 나머지 본문 영역. 자세한 배치는 `docs/design/screens.md`에 있습니다.

- 창 전체는 스크롤하지 않습니다. 사이드바와 본문이 각자 스크롤합니다.
- 사이드바 너비는 사용자가 정합니다(기본 264px, 200~480px). 디자인 토큰이 아니라 `src/features/shell/sidebarWidth.ts`에서 관리하는 값이며, 컴포넌트에서 유일하게 인라인 스타일로 들어가는 수치입니다.
- 간격은 Tailwind의 기본 간격 단계(0.25rem 단위)만 씁니다. 껍데기 안의 간격은 좁게(`gap-1`, `px-1.5`, `p-3`), 본문 안의 여백은 넉넉하게(`p-6`) 둡니다.
- 창이 좁아지면 사이드바를 접어 본문에 자리를 줍니다. 글자 크기나 간격을 줄이지 않습니다.

## Elevation & Depth

그림자를 쓰지 않습니다. 깊이는 면의 밝기 두 단계(종이와 껍데기)와 1px 괘선으로만 나타냅니다. 메뉴나 대화상자처럼 실제로 다른 것 위에 뜨는 요소가 생기면 그때 그림자 토큰을 추가하고 이 절을 고칩니다.

### Named Rules

**괘선으로 나눈다 규칙.** 나란히 놓인 영역(사이드바와 본문, 분할 영역끼리, 위쪽 줄과 그 아래)은 1px 괘선으로 나눕니다. 영역을 카드처럼 띄우거나 둥근 모서리와 여백으로 떼어 놓지 않습니다.

## Shapes

모서리는 살짝만 둥급니다. 기준 반지름은 0.375rem(`--radius`, `rounded-lg`)이고 작은 요소는 0.3rem(`rounded-md`)을 씁니다. 창을 나누는 영역 자체(사이드바, 위쪽 줄, 분할 영역)는 모서리가 각집니다. 둥근 모서리는 버튼, 입력란, 메뉴처럼 손으로 누르는 작은 요소에만 있습니다. 알약 모양이나 원형 버튼은 쓰지 않습니다.

아이콘은 lucide-react의 선 아이콘을 16px(`size-4`), 기본 선 굵기로 씁니다. 다른 아이콘 묶음이나 이모지를 섞지 않습니다.

## Components

지금 실제로 있는 것만 적습니다. 새 컴포넌트를 만든 task가 이 절에 추가합니다.

### Buttons

`src/components/ui/button.tsx`(shadcn/ui, base-nova).

- **Shape:** 살짝 둥근 사각형(0.375rem, 작은 크기는 0.3rem).
- **Ghost 아이콘 버튼** (`variant="ghost" size="icon-sm"`, 28px): 위쪽 줄의 사이드바 접기, 테마 전환처럼 껍데기에 놓이는 동작. 평소에는 배경이 없고 올리면 채움색이 깔립니다. `aria-label`과 `title`을 반드시 붙입니다.
- **Primary** (`variant="default"`, 높이 2rem): 잉크 배경에 밝은 글자. 한 화면의 주 동작 하나에만 씁니다.
- **Hover / Focus / Active:** 올리면 배경이 한 단계 진해지고, 키보드 포커스에는 포커스색 링(3px, 50% 투명도)이 생기며, 누르면 1px 내려갑니다. 비활성은 50% 투명도입니다.

### Top bar

`src/features/shell/TopBar.tsx`. 높이 2.5rem, 껍데기 면, 아래에 괘선. 왼쪽 끝에 사이드바 접기 버튼, 가운데에 워크스페이스 탭 자리, 오른쪽 끝에 창 단위 동작. 글자를 드래그해 선택할 수 없습니다.

### Sidebar

`src/features/shell/Sidebar.tsx`. 껍데기 면. 접으면 내용을 내리지 않고 숨깁니다(다시 펴면 스크롤 위치 등이 그대로).

### Sidebar resizer (경계선)

`src/features/shell/SidebarResizer.tsx`. 보이는 것은 1px 괘선이고 잡는 영역은 양옆으로 4px씩 넓습니다. 마우스를 올리거나 키보드 포커스가 가면 포커스색, 끄는 동안은 잉크색이 됩니다. 분할 영역 사이의 경계선(T-040)도 같은 모양과 상태를 씁니다.

### Region placeholder

`src/features/shell/RegionPlaceholder.tsx`. 기능이 들어오기 전의 빈 자리 표시. 흐린 글자 한 줄입니다. 기능이 들어오면 각 기능의 빈 상태 화면으로 바뀝니다.

### 잉크 선 (다음 task가 따를 규칙)

아직 구현된 곳은 끄는 중의 경계선뿐이지만, 이 디자인의 특징이므로 미리 정해 둡니다.

- **활성 워크스페이스 탭**(T-041): 탭 아래쪽에 잉크색 2px 선(`border-b-2 border-primary` 또는 같은 굵기의 요소). 탭 배경을 잉크로 칠하지 않습니다.
- **포커스된 분할 영역**(T-040): 영역 머리줄 아래 괘선을 잉크색 2px 선으로 바꿉니다. 영역 전체에 테두리를 두르지 않습니다.
- 한 화면에 잉크 선은 탭 줄에 하나, 본문에 하나입니다.

## Do's and Don'ts

### Do:

- **Do** 색·간격·글꼴·모서리는 `theme.css`의 토큰과 Tailwind 기본 단계만 씁니다(`bg-sidebar`, `text-muted-foreground`, `p-3`, `rounded-md`).
- **Do** 라이트와 다크 두 벌을 함께 확인합니다. 새 색 토큰은 `:root`와 `.dark`에 모두 정의합니다.
- **Do** 영역은 1px 괘선(`border-border`)으로 나눕니다.
- **Do** 현재 위치(활성 탭, 포커스된 영역)는 잉크색 2px 선 하나로 표시합니다.
- **Do** 모든 버튼에 hover, focus-visible, disabled 상태를 두고, 아이콘만 있는 버튼에는 `aria-label`을 붙입니다.
- **Do** 움직임은 상태 변화(hover, 포커스, 끌기)에만 150~250ms로 씁니다.
- **Do** 빈 상태에는 다음에 할 수 있는 일을 한두 줄로 적습니다.

### Don't:

- **Don't** 임의 값을 컴포넌트에 적지 않습니다(`text-[#123456]`, `p-[13px]`, `rounded-[10px]`).
- **Don't** 채도 0인 회색, 순수한 검정(`#000`)과 흰색(`#fff`)을 쓰지 않습니다.
- **Don't** 잉크색을 넓은 면이나 장식에 쓰지 않습니다.
- **Don't** 영역을 카드로 띄우거나 그림자·흐림 효과·그라데이션으로 꾸미지 않습니다.
- **Don't** 요소 한쪽에만 굵은 색 테두리를 넣어 강조하지 않습니다(카드나 목록 줄의 왼쪽 색 띠).
- **Don't** 이모지나 유니코드 기호를 아이콘 대신 쓰지 않습니다.
- **Don't** 창 너비에 따라 글자 크기를 바꾸지 않습니다.
- **Don't** Tokyo Night 테마의 색을 가져오지 않습니다.
