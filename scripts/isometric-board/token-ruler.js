import { tokenBase, tokenCell, tokenFootprintSize, measureBasePath } from "./geometry.js";

export function installBaseTokenRuler(board, environment) {
  const tokenConfig = environment.CONFIG?.Token;
  const Original = tokenConfig?.rulerClass;
  const methods = ["refresh", "_getWaypointStyle", "_getSegmentStyle", "_getGridHighlightStyle", "_getWaypointLabelContext"];
  if (!Original || methods.some(method => typeof Original.prototype?.[method] !== "function")) return false;

  // Use the configured ruler's v13/v14 extension points without changing document centers.
  class BaseAnchoredTokenRuler extends Original {
    constructor(token) {
      super(token);
      board.nativeRulers.add(this);
    }

    get usesBoard() {
      return board.enabled && this.token.document?.parent?.id === board.canvas?.scene?.id;
    }

    get canDisplayBoard() {
      return this.token.isPreview
        ? board.canMove(this.token) && (!this.token.document.hidden || board.game?.user?.isGM)
        : board.canSee(this.token);
    }

    get localDragDestination() {
      if (!this.usesBoard || !this.canDisplayBoard || !this.visible || this.token.document.isSecret) return null;
      // Use the snapped reachable endpoint, never hover history or another user's plan.
      return this.boardRulerData?.plannedMovement?.[board.game?.user?.id]?.foundPath?.at(-1) ?? null;
    }

    refresh(data) {
      this.boardRulerData = data;
      const result = super.refresh(data);
      this.refreshBasePath();
      return result;
    }

    _onVisibleChange() {
      super._onVisibleChange();
      this.refreshBasePath();
    }

    _getWaypointStyle(waypoint) {
      return this.usesBoard ? { radius: 0 } : super._getWaypointStyle(waypoint);
    }

    _getSegmentStyle(waypoint) {
      return this.usesBoard ? { width: 0 } : super._getSegmentStyle(waypoint);
    }

    _getGridHighlightStyle(waypoint, offset) {
      return this.usesBoard ? { alpha: 0 } : super._getGridHighlightStyle(waypoint, offset);
    }

    _getWaypointLabelContext(waypoint, state) {
      if (this.usesBoard && (waypoint.stage !== "planned" || board.opacity === 0 || !this.canDisplayBoard)) return;
      if (this.usesBoard && waypoint.hidden && waypoint.userId && waypoint.userId !== board.game?.user?.id) return;
      const context = super._getWaypointLabelContext(waypoint, state);
      if (!context || !this.usesBoard) return context;
      const base = tokenBase(this.token.document, waypoint, environment);
      const path = [];
      const seen = new Set();
      for (let current = waypoint; current && !seen.has(current); current = current.previous) {
        seen.add(current);
        path.unshift(current);
      }
      const measurement = measureBasePath(this.token.document, board.layout, path, environment);
      if (measurement) {
        context.cost = { total: String(measurement.total), units: "ft" };
        if (waypoint.index >= 2) context.cost.delta = `+${measurement.delta}`;
      }
      context.position = { x: base.x, y: base.y + 16 * (board.canvas.dimensions?.uiScale ?? 1) };
      return context;
    }

    refreshBasePath() {
      board.schedule();
      if (!this.usesBoard || !this.canDisplayBoard || !this.visible || !this.boardRulerData || !board.root) {
        if (this.basePath && !this.basePath.destroyed) this.basePath.visible = false;
        return;
      }
      // Foundry retains passed/pending movement for hover display after a drag ends.
      // Only planned movement belongs to an active local or remote drag.
      const paths = [];
      for (const [userId, movement] of Object.entries(this.boardRulerData.plannedMovement ?? {})) {
        if (movement.hidden && userId !== board.game?.user?.id) continue;
        const reachable = movement.foundPath ?? [];
        if (reachable.length) paths.push({ waypoints: reachable, destination: reachable.at(-1) });
        if (movement.unreachableWaypoints?.length) paths.push({
          waypoints: [...reachable.slice(-1), ...movement.unreachableWaypoints], blocked: true
        });
      }
      if (!paths.length) {
        if (this.basePath && !this.basePath.destroyed) {
          this.basePath.clear();
          this.basePath.visible = false;
        }
        return;
      }
      if (!this.basePath || this.basePath.destroyed) {
        this.basePath = new environment.PIXI.Graphics();
        this.basePath.name = "mk-shadowdark-base-ruler";
        this.basePath.eventMode = "none";
        board.root.addChild(this.basePath);
      }
      const graphics = this.basePath;
      graphics.visible = true;
      graphics.clear();
      const opacity = Math.min(1, board.opacity / 100 * 3);
      const layout = board.layout;
      for (const path of paths) {
        const points = path.waypoints.filter(waypoint => !waypoint.intermediate)
          .map(waypoint => tokenBase(this.token.document, waypoint, environment));
        if (!points.length) continue;
        graphics.lineStyle(1.5, path.blocked ? 0xe18d83 : 0xffe3a1, opacity);
        graphics.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
        if (path.destination) {
          const cell = tokenCell(this.token.document, layout, path.destination, environment);
          if (cell) graphics.drawPolygon(board.polygon(cell, layout, tokenFootprintSize(this.token.document, path.destination)));
        }
      }
    }

    clear() {
      this.boardRulerData = null;
      board.schedule();
      if (this.basePath && !this.basePath.destroyed) {
        this.basePath.clear();
        this.basePath.visible = false;
      }
      return super.clear();
    }

    destroy() {
      board.nativeRulers.delete(this);
      board.schedule();
      if (this.basePath && !this.basePath.destroyed) {
        this.basePath.parent?.removeChild(this.basePath);
        this.basePath.destroy();
      }
      this.basePath = null;
      return super.destroy();
    }
  }
  tokenConfig.rulerClass = BaseAnchoredTokenRuler;
  return true;
}
