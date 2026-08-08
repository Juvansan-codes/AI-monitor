import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Seed realistic DEMO DATA (3 workers, 3 jobs, 3 SOPs, GPS tracks, alerts,
 * scores and a report) so the supervisor command center is never empty.
 * All records are marked isDemo = true and rendered with DEMO DATA labels.
 * Idempotent: safe to call repeatedly.
 */
export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("workers").collect();
    if (existing.some((w) => w.isDemo)) {
      return { seeded: false, reason: "already-seeded" };
    }

    const now = Date.now();

    // --- SOPs --------------------------------------------------------------
    const motorSopId = await ctx.db.insert("sops", {
      name: "Motor Component Replacement",
      description:
        "Replace a failed component inside the motor enclosure. Lock-out/tag-out required before opening.",
      requiredTools: ["Screwdriver", "Wrench", "Torque wrench", "Component"],
      requiredPpe: ["Helmet", "Gloves", "Safety shoes", "Safety vest"],
      isDemo: true,
    });
    const motorSteps: [string, string, boolean][] = [
      ["Power OFF", "power_off", true],
      ["Wear PPE", "wear_ppe", true],
      ["Open Panel", "open_panel", false],
      ["Remove Component", "remove_component", false],
      ["Install New Component", "install_component", false],
      ["Tighten Screws", "tighten_screws", false],
      ["Close Panel", "close_panel", false],
      ["Power ON", "power_on", true],
    ];
    for (let i = 0; i < motorSteps.length; i++) {
      await ctx.db.insert("sopSteps", {
        sopId: motorSopId,
        stepNumber: i + 1,
        action: motorSteps[i][0],
        actionCode: motorSteps[i][1],
        requiredTools: motorSteps[i][2] ? [] : ["Screwdriver"],
        safetyCritical: motorSteps[i][2],
        description: "",
      });
    }

    const pumpSopId = await ctx.db.insert("sops", {
      name: "Pump Seal Replacement",
      description: "Replace the mechanical seal on a centrifugal pump.",
      requiredTools: ["Wrench", "Torque wrench", "Seal", "Puller"],
      requiredPpe: ["Helmet", "Gloves", "Safety shoes", "Uniform"],
      isDemo: true,
    });
    const pumpSteps: [string, string, boolean][] = [
      ["Isolate Pump", "isolate_pump", true],
      ["Depressurize Line", "depressurize", true],
      ["Remove Coupling Guard", "remove_guard", false],
      ["Remove Old Seal", "remove_seal", false],
      ["Install New Seal", "install_seal", false],
      ["Reassemble & Test", "reassemble_test", true],
    ];
    for (let i = 0; i < pumpSteps.length; i++) {
      await ctx.db.insert("sopSteps", {
        sopId: pumpSopId,
        stepNumber: i + 1,
        action: pumpSteps[i][0],
        actionCode: pumpSteps[i][1],
        requiredTools: [],
        safetyCritical: pumpSteps[i][2],
        description: "",
      });
    }

    const conveyorSopId = await ctx.db.insert("sops", {
      name: "Conveyor Belt Alignment",
      description: "Realign the conveyor belt tracking and tension.",
      requiredTools: ["Wrench", "Level", "Belt gauge"],
      requiredPpe: ["Helmet", "Gloves", "Safety shoes", "Safety vest"],
      isDemo: true,
    });
    const conveyorSteps: [string, string, boolean][] = [
      ["Lock-out Conveyor", "lockout", true],
      ["Inspect Belt Condition", "inspect_belt", false],
      ["Adjust Tension Rollers", "adjust_tension", false],
      ["Align Tracking Rollers", "align_tracking", false],
      ["Run Test Cycle", "test_cycle", true],
      ["Verify Alignment", "verify_alignment", false],
      ["Remove Lock-out", "remove_lockout", true],
    ];
    for (let i = 0; i < conveyorSteps.length; i++) {
      await ctx.db.insert("sopSteps", {
        sopId: conveyorSopId,
        stepNumber: i + 1,
        action: conveyorSteps[i][0],
        actionCode: conveyorSteps[i][1],
        requiredTools: [],
        safetyCritical: conveyorSteps[i][2],
        description: "",
      });
    }

    // --- Workers -------------------------------------------------------------
    const w101 = await ctx.db.insert("workers", {
      workerId: "W101",
      badgeNumber: "B-2214",
      name: "Alex Chen",
      isDemo: true,
      isOnline: false,
      lastSeenAt: now - 2 * HOUR,
    });
    const w102 = await ctx.db.insert("workers", {
      workerId: "W102",
      badgeNumber: "B-2217",
      name: "Maya Patel",
      isDemo: true,
      isOnline: true,
      lastSeenAt: now - 4 * MIN,
    });
    const w103 = await ctx.db.insert("workers", {
      workerId: "W103",
      badgeNumber: "B-2209",
      name: "Diego Ramirez",
      isDemo: true,
      isOnline: false,
      lastSeenAt: now - 20 * HOUR,
    });

    // --- Jobs ---------------------------------------------------------------
    const job1023 = await ctx.db.insert("jobs", {
      jobNumber: "JOB-1023",
      title: "Pump Seal Replacement",
      customer: "Northgate Water Utility",
      destinationAddress: "742 Terminal Blvd, San Francisco, CA",
      companyLat: 37.7694,
      companyLng: -122.4862,
      destinationLat: 37.7849,
      destinationLng: -122.431,
      plannedRoute: [
        [37.7694, -122.4862],
        [37.7708, -122.462],
        [37.7782, -122.4428],
        [37.7849, -122.431],
      ],
      workerId: w101,
      sopId: pumpSopId,
      status: "COMPLETED",
      stage: "Completed",
      startedAt: now - 3 * HOUR,
      endedAt: now - 2 * HOUR,
      currentLat: 37.7849,
      currentLng: -122.431,
      lastGpsAt: now - 2 * HOUR,
      isDemo: true,
    });

    const job1024 = await ctx.db.insert("jobs", {
      jobNumber: "JOB-1024",
      title: "Motor Maintenance",
      customer: "Bayline Manufacturing",
      destinationAddress: "1880 Industrial Pkwy, Hayward, CA",
      companyLat: 37.7694,
      companyLng: -122.4862,
      destinationLat: 37.72,
      destinationLng: -122.156,
      plannedRoute: [
        [37.7694, -122.4862],
        [37.762, -122.45],
        [37.748, -122.4],
        [37.74, -122.37],
        [37.72, -122.156],
      ],
      workerId: w102,
      sopId: motorSopId,
      status: "TRAVELING",
      stage: "Journey",
      startedAt: now - 52 * MIN,
      currentLat: 37.7402,
      currentLng: -122.3704,
      lastGpsAt: now - 4 * MIN,
      isDemo: true,
    });

    const job1025 = await ctx.db.insert("jobs", {
      jobNumber: "JOB-1025",
      title: "Conveyor Belt Alignment",
      customer: "Emery Distribution Hub",
      destinationAddress: "2200 Harbor Bay Pkwy, Alameda, CA",
      companyLat: 37.7694,
      companyLng: -122.4862,
      destinationLat: 37.7375,
      destinationLng: -122.222,
      plannedRoute: [
        [37.7694, -122.4862],
        [37.758, -122.4],
        [37.7375, -122.222],
      ],
      workerId: w103,
      sopId: conveyorSopId,
      status: "ASSIGNED",
      stage: "Assigned",
      isDemo: true,
    });

    await ctx.db.patch(w101, { currentJobId: job1023 });
    await ctx.db.patch(w102, { currentJobId: job1024 });
    await ctx.db.patch(w103, { currentJobId: job1025 });

    // --- GPS track for the active job (JOB-1024) ------------------------------
    const track: [number, number, number][] = [
      [37.7694, -122.4862, now - 52 * MIN],
      [37.7648, -122.4682, now - 44 * MIN],
      [37.762, -122.45, now - 36 * MIN],
      [37.7551, -122.4251, now - 28 * MIN],
      [37.748, -122.4, now - 20 * MIN],
      [37.7441, -122.3852, now - 12 * MIN],
      [37.7402, -122.3704, now - 4 * MIN],
    ];
    for (const [lat, lng, ts] of track) {
      await ctx.db.insert("locations", {
        jobId: job1024,
        workerId: w102,
        lat,
        lng,
        timestamp: ts,
        source: "demo",
        synced: true,
      });
    }

    // Completed job track
    for (const [lat, lng, ts] of [
      [37.7694, -122.4862, now - 3 * HOUR],
      [37.7708, -122.462, now - 2.75 * HOUR],
      [37.7782, -122.4428, now - 2.5 * HOUR],
      [37.7849, -122.431, now - 2.35 * HOUR],
    ]) {
      await ctx.db.insert("locations", {
        jobId: job1023,
        workerId: w101,
        lat,
        lng,
        timestamp: ts,
        source: "demo",
        synced: true,
      });
    }

    // --- PPE checks ----------------------------------------------------------
    const ppePass = {
      helmet: { detected: true, confidence: 0.96 },
      vest: { detected: true, confidence: 0.9 },
      gloves: { detected: true, confidence: 0.91 },
      goggles: { detected: true, confidence: 0.95 },
    };
    await ctx.db.insert("ppeChecks", {
      jobId: job1023,
      workerId: w101,
      stage: "pre_departure",
      items: ppePass,
      tools: [
        { tool: "Wrench", detected: true, confidence: 0.88 },
        { tool: "Seal", detected: true, confidence: 0.85 },
      ],
      overallStatus: "PASSED",
      mode: "production",
      timestamp: now - 3 * HOUR,
    });
    await ctx.db.insert("ppeChecks", {
      jobId: job1023,
      workerId: w101,
      stage: "worksite",
      items: ppePass,
      tools: [],
      overallStatus: "PASSED",
      mode: "production",
      timestamp: now - 2.3 * HOUR,
    });
    await ctx.db.insert("ppeChecks", {
      jobId: job1024,
      workerId: w102,
      stage: "pre_departure",
      items: ppePass,
      tools: [
        { tool: "Screwdriver", detected: true, confidence: 0.9 },
        { tool: "Wrench", detected: true, confidence: 0.87 },
      ],
      overallStatus: "PASSED",
      mode: "demo",
      timestamp: now - 54 * MIN,
    });

    // --- Sessions ------------------------------------------------------------
    await ctx.db.insert("sessions", {
      jobId: job1023,
      workerId: w101,
      sopId: pumpSopId,
      status: "COMPLETED",
      currentStepNumber: 7,
      completedSteps: [1, 2, 3, 4, 5, 6],
      skippedSteps: [],
      incorrectSteps: [],
      startedAt: now - 2.3 * HOUR,
      endedAt: now - 2 * HOUR,
    });
    await ctx.db.insert("sessions", {
      jobId: job1024,
      workerId: w102,
      sopId: motorSopId,
      status: "IN_PROGRESS",
      currentStepNumber: 3,
      completedSteps: [1, 2],
      skippedSteps: [],
      incorrectSteps: [],
      startedAt: now - 30 * MIN,
    });

    // --- Alerts ---------------------------------------------------------------
    await ctx.db.insert("alerts", {
      jobId: job1023,
      workerId: w101,
      type: "ROUTE_DEVIATION",
      severity: "LOW",
      message:
        "Vehicle position drifted 210 m from the planned route. Deviation resolved automatically.",
      resolved: true,
      resolvedAt: now - 2.6 * HOUR,
      timestamp: now - 2.66 * HOUR,
    });
    await ctx.db.insert("alerts", {
      jobId: job1023,
      workerId: w101,
      type: "SOP_STEP_SKIPPED",
      severity: "MEDIUM",
      message: "Step 4 (Remove Old Seal) was skipped. Sequence corrected.",
      expected: "Remove Old Seal",
      detected: "Install New Seal",
      sopStep: 4,
      resolved: true,
      resolvedAt: now - 2.2 * HOUR,
      timestamp: now - 2.24 * HOUR,
    });
    await ctx.db.insert("alerts", {
      jobId: job1024,
      workerId: w102,
      type: "LOW_CONFIDENCE",
      severity: "LOW",
      message:
        "Low detection confidence on PPE frame (48%). Frame re-analyzed. Simulated event for demo.",
      resolved: false,
      timestamp: now - 18 * MIN,
    });

    // --- Score + report for the completed job ----------------------------------
    const score = {
      ppeCompliance: 100,
      sopCompliance: 92,
      safetyCompliance: 100,
      routeCompliance: 96,
      sequenceCompliance: 90,
      toolCompliance: 95,
      overallScore: 95,
    };
    await ctx.db.insert("jobScores", {
      jobId: job1023,
      workerId: w101,
      ...score,
      calculatedAt: now - 2 * HOUR,
    });
    await ctx.db.insert("reports", {
      jobId: job1023,
      workerId: w101,
      data: {
        jobNumber: "JOB-1023",
        title: "Pump Seal Replacement",
        customer: "Northgate Water Utility",
        workerId: "W101",
        workerName: "Alex Chen",
        startedAt: now - 3 * HOUR,
        endedAt: now - 2 * HOUR,
        journeyDurationMs: 39 * MIN,
        ppeCompliance: 100,
        sopCompliance: 92,
        safetyCompliance: 100,
        routeCompliance: 96,
        overallScore: 95,
        violations: [
          {
            type: "ROUTE_DEVIATION",
            severity: "LOW",
            message: "Position drifted 210 m from planned route.",
            timestamp: now - 2.66 * HOUR,
            resolved: true,
          },
          {
            type: "SOP_STEP_SKIPPED",
            severity: "MEDIUM",
            message: "Step 4 (Remove Old Seal) skipped.",
            timestamp: now - 2.24 * HOUR,
            resolved: true,
          },
        ],
        sops: "Pump Seal Replacement",
      },
      generatedAt: now - 2 * HOUR,
    });

    return { seeded: true };
  },
});

export const seedStatus = query({
  args: {},
  handler: async (ctx) => {
    const workers = await ctx.db.query("workers").collect();
    return { seeded: workers.some((w) => w.isDemo) };
  },
});
