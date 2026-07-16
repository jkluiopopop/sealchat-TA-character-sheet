// ==UserScript==
// @name         三角机构规则
// @author       反光玻璃
// @version      1.1.1
// @timestamp    2026-07-16
// @license      MIT
// @description  Triangle Agency 核心 6D4 检定、QA 后结算、过载、混沌池、现实改写失败与 SealChat 人物卡资源同步。
// @homepageURL  https://github.com/sealdice/sealdice-core
// @sealVersion  1.4.5
// ==/UserScript==

"use strict";

const TA_EXT_NAME = "triangle-agency-sealchat";
const TA_EXT_AUTHOR = "反光玻璃";
const TA_EXT_VERSION = "1.1.1";
const TA_CHAOS_VAR = "$g混沌";
const TA_REALITY_FAIL_VAR = "$g改写失败";
// 跨指令状态必须使用持久变量；$t 前缀只在单次指令执行期间有效。
const TA_PENDING_VAR = "$mTA待结算";
const TA_TRIA_VAR = "$mTA三重升华";
const TA_EXTRA_OVERLOAD_ATTR = "额外过载";
const TA_CHAOS_MIRROR_ATTR = "混沌";
const TA_REALITY_FAIL_MIRROR_ATTR = "改写失败";
const TA_COMMENDATION_ATTR = "嘉奖";

const TA_QUALITIES = [
    "缜密",
    "欺瞒",
    "活力",
    "共情",
    "主动",
    "坚持",
    "气质",
    "专业",
    "低调",
];

const TA_QUALITY_ALIASES = {
    "缜密": "缜密",
    "专注": "缜密",
    "att": "缜密",
    "欺瞒": "欺瞒",
    "dup": "欺瞒",
    "活力": "活力",
    "外向": "活力",
    "dyn": "活力",
    "共情": "共情",
    "emp": "共情",
    "主动": "主动",
    "ini": "主动",
    "坚持": "坚持",
    "坚毅": "坚持",
    "per": "坚持",
    "气质": "气质",
    "气场": "气质",
    "仪态": "气质",
    "存在": "气质",
    "pre": "气质",
    "专业": "专业",
    "敬业": "专业",
    "pro": "专业",
    "低调": "低调",
    "诡秘": "低调",
    "精微": "低调",
    "sub": "低调",
};

const TA_GAME_TEMPLATE = {
    name: "ta",
    fullName: "三角机构规则（SealChat 联动版）",
    authors: [TA_EXT_AUTHOR],
    version: TA_EXT_VERSION,
    updatedTime: "20260716",
    nameTemplate: {
        ta: {
            template: "{$t玩家_RAW}",
            helpText: "自动设置名片",
        },
    },
    attrSettings: {
        top: TA_QUALITIES.concat(["嘉奖", "处分", "燃尽", "额外过载"]),
        sortBy: "name",
        showAs: {},
    },
    setConfig: {
        diceSides: 4,
        keys: ["ta", "triangle-agency"],
        enableTip: "已切换至三角机构规则，并自动开启 SealChat 联动扩展",
        relatedExt: ["coc7", TA_EXT_NAME],
    },
    defaults: {
        "缜密": 0,
        "欺瞒": 0,
        "活力": 0,
        "共情": 0,
        "主动": 0,
        "坚持": 0,
        "气质": 0,
        "专业": 0,
        "低调": 0,
        "嘉奖": 0,
        "处分": 0,
        "燃尽": 0,
        "额外过载": 0,
    },
    alias: {
        "缜密": ["专注", "ATT"],
        "欺瞒": ["DUP"],
        "活力": ["外向", "DYN"],
        "共情": ["EMP"],
        "主动": ["INI"],
        "坚持": ["坚毅", "PER"],
        "气质": ["气场", "仪态", "存在", "PRE"],
        "专业": ["敬业", "PRO"],
        "低调": ["诡秘", "精微", "SUB"],
    },
};

try {
    seal.gameSystem.newTemplate(JSON.stringify(TA_GAME_TEMPLATE));
    console.log("TA SealChat 联动规则模板装载完毕");
}
catch (e) {
    console.error("无法装载 TA SealChat 联动规则模板: " + e);
}

let TA_EXTENSION = seal.ext.find(TA_EXT_NAME);
if (!TA_EXTENSION) {
    TA_EXTENSION = seal.ext.new(TA_EXT_NAME, TA_EXT_AUTHOR, TA_EXT_VERSION);
    seal.ext.register(TA_EXTENSION);
}

function taResult() {
    return seal.ext.newCmdExecuteResult(true);
}

function taReply(ctx, msg, text) {
    seal.replyToSender(ctx, msg, text);
}

function taTarget(ctx, cmdArgs) {
    const proxy = seal.getCtxProxyFirst(ctx, cmdArgs);
    return proxy || ctx;
}

function taIntGet(ctx, key, fallback) {
    const result = seal.vars.intGet(ctx, key);
    return result[1] ? result[0] : (fallback || 0);
}

function taNonNegativeIntGet(ctx, key) {
    return Math.max(0, taIntGet(ctx, key, 0));
}

function taIntSet(ctx, key, value) {
    seal.vars.intSet(ctx, key, Math.trunc(value));
}

function taParseInteger(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!/^[+-]?\d+$/.test(text)) {
        return null;
    }
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : null;
}

function taNormalizeQuality(raw) {
    const text = String(raw || "").trim();
    if (!text) {
        return "";
    }
    return TA_QUALITY_ALIASES[text] || TA_QUALITY_ALIASES[text.toLowerCase()] || "";
}

function taActorName(ctx) {
    const name = seal.format(ctx, "{$t玩家_RAW}");
    return name || "当前员工";
}

function taGroupId(ctx, msg) {
    if (ctx && ctx.group && ctx.group.groupId) {
        return String(ctx.group.groupId);
    }
    if (msg && msg.groupId) {
        return String(msg.groupId);
    }
    return "private";
}

function taRollD4() {
    return Math.floor(Math.random() * 4) + 1;
}

function taRoll6D4() {
    const dice = [];
    for (let i = 0; i < 6; i++) {
        dice.push(taRollD4());
    }
    return dice;
}

function taDiceText(dice) {
    return "6D4=[" + dice.map(function (value) { return value === 3 ? "【3】" : value; }).join(",") + "]";
}

function taJsonGet(ctx, key) {
    const result = seal.vars.strGet(ctx, key);
    if (!result[1] || !result[0]) {
        return null;
    }
    try {
        return JSON.parse(result[0]);
    }
    catch (e) {
        return null;
    }
}

function taJsonSet(ctx, key, value) {
    seal.vars.strSet(ctx, key, value == null ? "" : JSON.stringify(value));
}

function taKwarg(cmdArgs, name) {
    const item = cmdArgs.getKwarg(name);
    if (!item) {
        return null;
    }
    return item.valueExists ? String(item.value) : "";
}

function taPendingSummary(pending) {
    if (!pending) {
        return "无";
    }
    return pending.quality + (pending.reality ? "现实改写" : "检定") +
        "，原始" + pending.rawThrees + "个3，过载" + pending.overload;
}

function taMirrorGroupResources(target) {
    const chaos = taNonNegativeIntGet(target, TA_CHAOS_VAR);
    const realityFailures = taNonNegativeIntGet(target, TA_REALITY_FAIL_VAR);
    taIntSet(target, TA_CHAOS_MIRROR_ATTR, chaos);
    taIntSet(target, TA_REALITY_FAIL_MIRROR_ATTR, realityFailures);
    return [chaos, realityFailures];
}

function taSetGroupResource(target, groupVar, mirrorAttr, value) {
    const next = Math.max(0, Math.trunc(value));
    taIntSet(target, groupVar, next);
    taIntSet(target, mirrorAttr, next);
    return next;
}

function taChaosFor(finalThrees, overload) {
    // 规则书的“稳定性”：最终正好三个3时产生0混沌，过载也不例外。
    if (finalThrees === 3) {
        return 0;
    }
    return Math.max(0, 6 - Math.min(6, finalThrees)) + overload;
}

function taResolvePending(target, pending, adjustment) {
    const cost = Math.abs(adjustment);
    const currentQA = taNonNegativeIntGet(target, pending.quality);
    if (cost > currentQA) {
        return { error: pending.quality + " QA不足：当前" + currentQA + "，需要" + cost + "。" };
    }
    if (adjustment > 0 && pending.rawThrees + adjustment > 6) {
        return { error: "最多只能将结果补到6个3。" };
    }
    if (adjustment < 0 && pending.rawThrees + adjustment < 0) {
        return { error: "移除的3不能超过原始结果中的3。" };
    }

    const adjustedThrees = pending.rawThrees + adjustment;
    const finalThrees = Math.max(0, adjustedThrees - pending.overload);
    const success = finalThrees > 0;
    const chaosGenerated = pending.skipChaos ? 0 : taChaosFor(finalThrees, pending.overload);
    const currentChaos = taNonNegativeIntGet(target, TA_CHAOS_VAR);
    const nextChaos = taSetGroupResource(target, TA_CHAOS_VAR, TA_CHAOS_MIRROR_ATTR, currentChaos + chaosGenerated);
    let nextFailures = taNonNegativeIntGet(target, TA_REALITY_FAIL_VAR);

    if (cost > 0) {
        taIntSet(target, pending.quality, currentQA - cost);
    }
    if (pending.reality && !success && !pending.skipFailure) {
        nextFailures = taSetGroupResource(target, TA_REALITY_FAIL_VAR, TA_REALITY_FAIL_MIRROR_ATTR, nextFailures + 1);
    }
    else {
        taIntSet(target, TA_REALITY_FAIL_MIRROR_ATTR, nextFailures);
    }
    taJsonSet(target, TA_PENDING_VAR, null);

    return {
        adjustedThrees: adjustedThrees,
        finalThrees: finalThrees,
        success: success,
        chaosGenerated: chaosGenerated,
        nextChaos: nextChaos,
        nextFailures: nextFailures,
        qaBefore: currentQA,
        qaAfter: currentQA - cost,
    };
}

function taResolveText(target, pending, adjustment, resolved) {
    const qaText = adjustment === 0
        ? "QA不调整"
        : "QA调整 " + (adjustment > 0 ? "+" : "") + adjustment +
            "｜" + pending.quality + " QA " + resolved.qaBefore + " → " + resolved.qaAfter;
    const overloadText = resolved.finalThrees === 3
        ? "稳定的三个3"
        : (pending.overload > 0
            ? resolved.adjustedThrees + "个3 - 过载" + pending.overload + " = " + resolved.finalThrees + "个3"
            : resolved.finalThrees + "个3");
    return taActorName(target) + "｜“" + pending.quality + "”" + (pending.reality ? "现实改写" : "检定") + "结算\n" +
        taDiceText(pending.dice) + "\n" +
        qaText + "\n" +
        overloadText + "｜" + (resolved.success ? "成功" : "失败") + "\n" +
        "混沌 +" + resolved.chaosGenerated + "｜混沌池 " + resolved.nextChaos +
        (pending.reality ? "\n改写失败 " + resolved.nextFailures : "");
}

function taBeginCheck(ctx, msg, cmdArgs, reality) {
    const result = taResult();
    const quality = taNormalizeQuality(cmdArgs.getArgN(1));
    if (!quality) {
        result.showHelp = true;
        return result;
    }

    const target = taTarget(ctx, cmdArgs);
    const currentQA = taNonNegativeIntGet(target, quality);
    const extraOverload = taNonNegativeIntGet(target, TA_EXTRA_OVERLOAD_ATTR);
    const realityFailures = reality ? taNonNegativeIntGet(target, TA_REALITY_FAIL_VAR) : 0;
    const overload = (currentQA <= 0 ? 1 : 0) + extraOverload + realityFailures;
    const dice = taRoll6D4();
    const rawThrees = dice.filter(function (value) { return value === 3; }).length;
    const pending = {
        groupId: taGroupId(target, msg),
        actorName: taActorName(target),
        quality: quality,
        reality: reality,
        dice: dice,
        rawThrees: rawThrees,
        overload: overload,
        skipChaos: taKwarg(cmdArgs, "c") !== null,
        skipFailure: taKwarg(cmdArgs, "f") !== null,
    };

    if (rawThrees === 3) {
        taJsonSet(target, TA_PENDING_VAR, null);
        taJsonSet(target, TA_TRIA_VAR, {
            groupId: pending.groupId,
            actorName: pending.actorName,
            status: "unclaimed",
            remaining: 3,
        });
        taIntSet(target, TA_CHAOS_MIRROR_ATTR, taNonNegativeIntGet(target, TA_CHAOS_VAR));
        taIntSet(target, TA_REALITY_FAIL_MIRROR_ATTR, taNonNegativeIntGet(target, TA_REALITY_FAIL_VAR));
        taReply(ctx, msg,
            taActorName(target) + "｜“" + quality + "”" + (reality ? "现实改写" : "检定") + "\n" +
            taDiceText(dice) + "\n" +
            "原始结果恰好三个3：三重升华，检定成功，产生0混沌。\n" +
            "下一步：.tatri all／.tatri qa <素质> <1-3>／.tatri commend"
        );
        return result;
    }

    taJsonSet(target, TA_PENDING_VAR, pending);
    const immediate = taKwarg(cmdArgs, "qa");
    if (immediate !== null) {
        const adjustment = taParseInteger(immediate);
        if (adjustment === null) {
            taReply(ctx, msg, "--qa 需要整数，例如 --qa=0、--qa=2 或 --qa=-1。");
            return result;
        }
        const resolved = taResolvePending(target, pending, adjustment);
        if (resolved.error) {
            taReply(ctx, msg, resolved.error);
            return result;
        }
        taReply(ctx, msg, taResolveText(target, pending, adjustment, resolved));
        return result;
    }

    taReply(ctx, msg,
        taActorName(target) + "｜“" + quality + "”" + (reality ? "现实改写" : "检定") + "\n" +
        taDiceText(dice) + "\n" +
        "原始3：" + rawThrees + "｜待应用过载：" + overload + "\n" +
        "下一步：.taq <QA调整>（0不花QA，正数增加3，负数移除3）"
    );
    return result;
}
const TA_CMD_CHECK = seal.ext.newCmdItemInfo();
TA_CMD_CHECK.name = "ta";
TA_CMD_CHECK.help = "ta <素质> [--qa=N] [--c]：掷6D4并等待QA结算；--qa=N可立即结算，--c不增加混沌。\ntr <素质> [--qa=N] [--c] [--f]：现实改写检定；失败会增加地点过载，--f不记录本次失败。";
TA_CMD_CHECK.allowDelegate = true;
TA_CMD_CHECK.solve = function (ctx, msg, cmdArgs) {
    return taBeginCheck(ctx, msg, cmdArgs, cmdArgs.command === "tr");
};
TA_EXTENSION.cmdMap.ta = TA_CMD_CHECK;
TA_EXTENSION.cmdMap.tr = TA_CMD_CHECK;

const TA_CMD_RESOLVE = seal.ext.newCmdItemInfo();
TA_CMD_RESOLVE.name = "taq";
TA_CMD_RESOLVE.help = "taq <QA调整>：结算最近一次TA检定。0不花QA，正数增加3，负数移除3；花费量为绝对值。";
TA_CMD_RESOLVE.allowDelegate = true;
TA_CMD_RESOLVE.solve = function (ctx, msg, cmdArgs) {
    const result = taResult();
    const adjustment = taParseInteger(cmdArgs.getArgN(1));
    if (adjustment === null) {
        result.showHelp = true;
        return result;
    }
    const target = taTarget(ctx, cmdArgs);
    const pending = taJsonGet(target, TA_PENDING_VAR);
    if (!pending) {
        taReply(ctx, msg, "当前没有待结算的三角机构检定。请先使用 .ta <素质> 或 .tr <素质>。 ");
        return result;
    }
    if (pending.groupId !== taGroupId(target, msg)) {
        taReply(ctx, msg, "待结算检定来自另一个群或会话，请回到原会话结算，或重新发起检定。 ");
        return result;
    }
    if (pending.actorName && pending.actorName !== taActorName(target)) {
        taReply(ctx, msg, "当前绑定人物卡已从“" + pending.actorName + "”切换为“" + taActorName(target) + "”。为防止扣错资源，请切回原人物卡后结算。 ");
        return result;
    }
    const resolved = taResolvePending(target, pending, adjustment);
    if (resolved.error) {
        taReply(ctx, msg, resolved.error);
        return result;
    }
    taReply(ctx, msg, taResolveText(target, pending, adjustment, resolved));
    return result;
};
TA_EXTENSION.cmdMap.taq = TA_CMD_RESOLVE;

const TA_CMD_CANCEL = seal.ext.newCmdItemInfo();
TA_CMD_CANCEL.name = "tacancel";
TA_CMD_CANCEL.help = "tacancel：放弃当前人物卡最近一次尚未结算的TA检定。";
TA_CMD_CANCEL.allowDelegate = true;
TA_CMD_CANCEL.solve = function (ctx, msg, cmdArgs) {
    const result = taResult();
    const target = taTarget(ctx, cmdArgs);
    const pending = taJsonGet(target, TA_PENDING_VAR);
    if (!pending) {
        taReply(ctx, msg, "当前没有待结算的三角机构检定。");
        return result;
    }
    if (pending.groupId !== taGroupId(target, msg)) {
        taReply(ctx, msg, "待结算检定来自另一个群或会话，不能在此取消。");
        return result;
    }
    if (pending.actorName && pending.actorName !== taActorName(target)) {
        taReply(ctx, msg, "本次待结算检定属于人物卡“" + pending.actorName + "”，请切回该人物卡后取消。");
        return result;
    }
    taJsonSet(target, TA_PENDING_VAR, null);
    taReply(ctx, msg, "已放弃“" + pending.quality + "”" + (pending.reality ? "现实改写" : "检定") + "的待结算结果。");
    return result;
};
TA_EXTENSION.cmdMap.tacancel = TA_CMD_CANCEL;

const TA_CMD_STATUS = seal.ext.newCmdItemInfo();
TA_CMD_STATUS.name = "tas";
TA_CMD_STATUS.help = "tas：显示当前人物卡九项QA、上限、额外过载、群混沌、地点现实改写失败和待结算检定，并同步群资源镜像。";
TA_CMD_STATUS.allowDelegate = true;
TA_CMD_STATUS.solve = function (ctx, msg, cmdArgs) {
    const target = taTarget(ctx, cmdArgs);
    const groupResources = taMirrorGroupResources(target);
    const rows = TA_QUALITIES.map(function (quality) {
        return quality + " " + taNonNegativeIntGet(target, quality) + "/" + taNonNegativeIntGet(target, quality + "上限");
    });
    const pending = taJsonGet(target, TA_PENDING_VAR);
    taReply(ctx, msg,
        taActorName(target) + "的三角机构资源：\n" +
        rows.join("　") + "\n" +
        "额外过载：" + taNonNegativeIntGet(target, TA_EXTRA_OVERLOAD_ATTR) +
        "；群混沌池：" + groupResources[0] +
        "；地点改写失败：" + groupResources[1] + "\n" +
        "待结算：" + taPendingSummary(pending)
    );
    return taResult();
};
TA_EXTENSION.cmdMap.tas = TA_CMD_STATUS;

const TA_CMD_RESTORE = seal.ext.newCmdItemInfo();
TA_CMD_RESTORE.name = "tarest";
TA_CMD_RESTORE.help = "tarest：任务间隙将九项QA恢复到人物卡记录的上限。";
TA_CMD_RESTORE.allowDelegate = true;
TA_CMD_RESTORE.solve = function (ctx, msg, cmdArgs) {
    const target = taTarget(ctx, cmdArgs);
    const restored = [];
    const missing = [];
    TA_QUALITIES.forEach(function (quality) {
        const max = taNonNegativeIntGet(target, quality + "上限");
        if (max > 0) {
            taIntSet(target, quality, max);
            restored.push(quality + "=" + max);
        }
        else {
            missing.push(quality);
        }
    });
    const restoredText = restored.length ? "QA已恢复：" + restored.join("，") : "没有可恢复的QA上限。";
    const missingText = missing.length ? "\n未记录上限：" + missing.join("、") + "。请先在SealChat角色卡中填写并保存QA上限。" : "";
    taReply(ctx, msg, restoredText + missingText);
    return taResult();
};
TA_EXTENSION.cmdMap.tarest = TA_CMD_RESTORE;

function taResourceCommand(name, groupVar, mirrorAttr, label) {
    const command = seal.ext.newCmdItemInfo();
    command.name = name;
    command.help = name + "：查询" + label + "；" + name + " <正数>消除、<负数>增加；" + name + "t <数值>直接设置；" + name + " sync同步到当前人物卡。";
    command.solve = function (ctx, msg, cmdArgs) {
        const result = taResult();
        cmdArgs.chopPrefixToArgsWith("t", "set");
        let subcommand = cmdArgs.getArgN(1);
        const isSet = subcommand === "t" || subcommand === "set";
        if (isSet) {
            subcommand = cmdArgs.getArgN(2);
        }
        const target = ctx;
        const current = taNonNegativeIntGet(target, groupVar);
        if (!subcommand) {
            taIntSet(target, mirrorAttr, current);
            taReply(ctx, msg, "当前" + label + "：" + current);
            return result;
        }
        if (subcommand === "help") {
            result.showHelp = true;
            return result;
        }
        if (subcommand === "sync") {
            taIntSet(target, mirrorAttr, current);
            taReply(ctx, msg, label + "已同步到当前人物卡：" + current);
            return result;
        }
        const raw = cmdArgs.getRestArgsFrom(isSet ? 2 : 1);
        const value = taParseInteger(seal.format(ctx, "{" + raw + "}"));
        if (value === null) {
            taReply(ctx, msg, "无法解析数值：" + raw);
            return result;
        }
        const next = taSetGroupResource(target, groupVar, mirrorAttr, isSet ? value : current - value);
        taReply(ctx, msg, label + "：" + current + " → " + next);
        return result;
    };
    return command;
}

const TA_CMD_CHAOS = taResourceCommand("tcs", TA_CHAOS_VAR, TA_CHAOS_MIRROR_ATTR, "群混沌池");
TA_EXTENSION.cmdMap.tcs = TA_CMD_CHAOS;
const TA_CMD_FAILURES = taResourceCommand("tfs", TA_REALITY_FAIL_VAR, TA_REALITY_FAIL_MIRROR_ATTR, "地点现实改写失败");
TA_EXTENSION.cmdMap.tfs = TA_CMD_FAILURES;

const TA_CMD_TRIA = seal.ext.newCmdItemInfo();
TA_CMD_TRIA.name = "tatri";
TA_CMD_TRIA.help = "tatri：查看待选择的三重升华。\ntatri all：全员协力。\ntatri qa <素质> <1-3>：补充QA，可分多次分配共3点。\ntatri commend：获得3次嘉奖。";
TA_CMD_TRIA.allowDelegate = true;
TA_CMD_TRIA.solve = function (ctx, msg, cmdArgs) {
    const result = taResult();
    const target = taTarget(ctx, cmdArgs);
    const state = taJsonGet(target, TA_TRIA_VAR);
    if (!state || state.groupId !== taGroupId(target, msg)) {
        taReply(ctx, msg, "当前没有待选择效果的三重升华。");
        return result;
    }
    if (state.actorName && state.actorName !== taActorName(target)) {
        taReply(ctx, msg, "本次三重升华属于人物卡“" + state.actorName + "”，请切回该人物卡后选择效果。");
        return result;
    }
    const action = String(cmdArgs.getArgN(1) || "").toLowerCase();
    if (!action) {
        taReply(ctx, msg, "有一次三重升华待处理。可选：all（全员协力）、qa（补充共3点QA）、commend（获得3次嘉奖）。剩余可补充QA：" + state.remaining);
        return result;
    }
    if (action === "all" || action === "协力" || action === "全员协力") {
        if (state.status === "qa") {
            taReply(ctx, msg, "本次升华已经选择了补充QA，不能改选其他效果。");
            return result;
        }
        taJsonSet(target, TA_TRIA_VAR, null);
        taReply(ctx, msg, "三重升华效果已选择：全员协力。本次检定可按规则增加任意数量的3。");
        return result;
    }
    if (action === "commend" || action === "嘉奖" || action === "此刻之星") {
        if (state.status === "qa") {
            taReply(ctx, msg, "本次升华已经选择了补充QA，不能改选其他效果。");
            return result;
        }
        const before = taNonNegativeIntGet(target, TA_COMMENDATION_ATTR);
        taIntSet(target, TA_COMMENDATION_ATTR, before + 3);
        taJsonSet(target, TA_TRIA_VAR, null);
        taReply(ctx, msg, "三重升华效果已选择：此刻之星。嘉奖 " + before + " → " + (before + 3) + "，已同步到人物卡。");
        return result;
    }
    if (action === "qa" || action === "稍后重议") {
        const quality = taNormalizeQuality(cmdArgs.getArgN(2));
        const amount = taParseInteger(cmdArgs.getArgN(3) || "1");
        if (!quality || amount === null || amount < 1 || amount > 3) {
            taReply(ctx, msg, "用法：.tatri qa <素质> <1-3>，例如 .tatri qa 缜密 2。 ");
            return result;
        }
        if (state.status !== "unclaimed" && state.status !== "qa") {
            taReply(ctx, msg, "本次升华已经选择了其他效果。");
            return result;
        }
        if (amount > state.remaining) {
            taReply(ctx, msg, "本次升华只剩 " + state.remaining + " 点QA可补充。");
            return result;
        }
        const current = taNonNegativeIntGet(target, quality);
        const max = taNonNegativeIntGet(target, quality + "上限");
        if (max <= 0) {
            taReply(ctx, msg, "人物卡未记录“" + quality + "”QA上限，请先在SealChat角色卡中填写并保存。");
            return result;
        }
        const actual = Math.min(amount, Math.max(0, max - current));
        if (actual <= 0) {
            taReply(ctx, msg, quality + " QA已经达到上限 " + max + "。");
            return result;
        }
        taIntSet(target, quality, current + actual);
        state.status = "qa";
        state.remaining -= actual;
        if (state.remaining <= 0) {
            taJsonSet(target, TA_TRIA_VAR, null);
        }
        else {
            taJsonSet(target, TA_TRIA_VAR, state);
        }
        taReply(ctx, msg, "三重升华：" + quality + " QA " + current + " → " + (current + actual) + "。" +
            (state.remaining > 0 ? "还可补充 " + state.remaining + " 点QA。" : "三点QA已全部补充。"));
        return result;
    }
    result.showHelp = true;
    return result;
};
TA_EXTENSION.cmdMap.tatri = TA_CMD_TRIA;
