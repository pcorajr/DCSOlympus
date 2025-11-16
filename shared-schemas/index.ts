/**
 * Shared TypeScript schemas for BFIS ⇄ Olympus data contract.
 * 
 * These types define the interface between BFIS and DCSOlympus. They are imported
 * by both bfis-service and potentially frontend code to ensure type safety and
 * prevent schema drift.
 * 
 * Per spec: This file contains all shared TypeScript interfaces:
 * - OlympusUnitPosition, OlympusCoalition, OlympusUnit
 * - OlympusEvent, OlympusSnapshot
 * - BfisActionType, BfisActionTarget, BfisActionParams, BfisAction
 * - BfisDecision, CommandStatus, CommandResult
 * 
 * TODO: Implement all interfaces from the BFIS ⇄ Olympus Simple Strategy spec.
 */
