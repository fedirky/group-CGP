import { Controls, Euler, Vector3 } from './three.r168.module.js';

import { isSolidAt } from './collision.js';

const _changeEvent = { type: 'change' };
const _PI_2 = Math.PI / 2;
const _euler = new Euler(0, 0, 0, 'YXZ');
const _forward = new Vector3();
const _right = new Vector3();
const _move = new Vector3();

// World coordinate -> integer block index. Blocks span [idx-0.5, idx+0.5],
// so the block containing coordinate c is floor(c + 0.5).
function blockIndex(c) {
	return Math.floor(c + 0.5);
}

// The collider is shrunk by this much when picking which cells it overlaps on
// the axes we're NOT resolving. Without it, standing flush against a wall makes
// that wall's column count on the other axes, which blocks sliding/jumping
// alongside it (the "sticking to walls" bug).
const COLLISION_SKIN = 1e-3;

class MinecraftControls extends Controls {

	constructor(object, domElement = null) {

		super(object, domElement);

		this.lookSpeed = 0.002;
		this.movementSpeed = 10;
		this.sprintMultiplier = 1.8;
		this.verticalSpeedMultiplier = 0.85;
		this.minPolarAngle = 0;
		this.maxPolarAngle = Math.PI;
		this.isLocked = false;

		// Movement mode: 'fly' (free creative flight) or 'walk' (gravity + jumping).
		this.mode = 'fly';

		// Walk-mode physics, tuned to the Minecraft-like feel requested:
		// a 1.7-block-tall player that can jump 1.3 blocks high.
		this.walkSpeed = 4.3;             // blocks/second (Minecraft is ~4.317)
		this.walkSprintMultiplier = 1.35;
		this.gravity = 26;                // blocks/second^2
		this.jumpHeight = 1.3;            // peak jump height in blocks
		this.playerHeight = 1.7;          // collider height in blocks
		this.eyeHeight = 1.5;             // camera height above the feet
		this.playerHalfWidth = 0.3;       // collider half-width (0.6 wide)
		this.maxFallSpeed = 18;           // clamp fall speed so we never tunnel a block

		this._velocityY = 0;
		this._onGround = false;

		this._keys = {
			forward: false,
			back: false,
			left: false,
			right: false,
			up: false,
			down: false,
			sprint: false
		};

		this._lastPosition = new Vector3();
		this._lastRotation = new Euler();

		this._onClick = onClick.bind(this);
		this._onMouseMove = onMouseMove.bind(this);
		this._onPointerLockChange = onPointerLockChange.bind(this);
		this._onPointerLockError = onPointerLockError.bind(this);
		this._onKeyDown = onKeyDown.bind(this);
		this._onKeyUp = onKeyUp.bind(this);
		this._onBlur = onBlur.bind(this);
		this._onContextMenu = onContextMenu.bind(this);

		this.object.rotation.order = 'YXZ';

		if (domElement !== null) {
			this.connect();
		}

	}

	connect() {

		this.domElement.addEventListener('click', this._onClick);
		this.domElement.addEventListener('contextmenu', this._onContextMenu);
		document.addEventListener('mousemove', this._onMouseMove);
		document.addEventListener('pointerlockchange', this._onPointerLockChange);
		document.addEventListener('pointerlockerror', this._onPointerLockError);
		window.addEventListener('keydown', this._onKeyDown);
		window.addEventListener('keyup', this._onKeyUp);
		window.addEventListener('blur', this._onBlur);

	}

	disconnect() {

		this.domElement.removeEventListener('click', this._onClick);
		this.domElement.removeEventListener('contextmenu', this._onContextMenu);
		document.removeEventListener('mousemove', this._onMouseMove);
		document.removeEventListener('pointerlockchange', this._onPointerLockChange);
		document.removeEventListener('pointerlockerror', this._onPointerLockError);
		window.removeEventListener('keydown', this._onKeyDown);
		window.removeEventListener('keyup', this._onKeyUp);
		window.removeEventListener('blur', this._onBlur);

	}

	dispose() {

		this.disconnect();

	}

	lock() {

		if (this.enabled === false || document.pointerLockElement === this.domElement) return;

		let request;

		try {
			request = this.domElement.requestPointerLock({ unadjustedMovement: true });
		} catch {
			request = this.domElement.requestPointerLock();
		}

		if (request && typeof request.catch === 'function') {
			request.catch((error) => {
				if (error.name === 'NotSupportedError') {
					this.domElement.requestPointerLock();
				}
			});
		}

	}

	unlock() {

		if (document.pointerLockElement === this.domElement) {
			document.exitPointerLock();
		}

	}

	update(delta) {

		if (this.enabled === false || this.isLocked === false || delta <= 0) return;

		if (this.mode === 'walk') {
			this._updateWalk(delta);
		} else {
			this._updateFly(delta);
		}

		if (
			this._lastPosition.distanceToSquared(this.object.position) > 0.000001 ||
			Math.abs(this._lastRotation.x - this.object.rotation.x) > 0.000001 ||
			Math.abs(this._lastRotation.y - this.object.rotation.y) > 0.000001
		) {
			this.dispatchEvent(_changeEvent);
			this._lastPosition.copy(this.object.position);
			this._lastRotation.copy(this.object.rotation);
		}

	}

	_updateFly(delta) {

		const forwardInput = Number(this._keys.forward) - Number(this._keys.back);
		const rightInput = Number(this._keys.right) - Number(this._keys.left);
		const verticalInput = Number(this._keys.up) - Number(this._keys.down);

		_move.set(0, 0, 0);

		if (forwardInput !== 0 || rightInput !== 0) {
			const yaw = this.object.rotation.y;

			_forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
			_right.set(Math.cos(yaw), 0, -Math.sin(yaw));

			_move.addScaledVector(_forward, forwardInput);
			_move.addScaledVector(_right, rightInput);
			_move.normalize();
		}

		if (verticalInput !== 0) {
			_move.y = verticalInput * this.verticalSpeedMultiplier;
		}

		if (_move.lengthSq() > 0) {
			const speed = this.movementSpeed * (this._keys.sprint ? this.sprintMultiplier : 1);
			this.object.position.addScaledVector(_move, speed * delta);
		}

	}

	_updateWalk(delta) {

		const forwardInput = Number(this._keys.forward) - Number(this._keys.back);
		const rightInput = Number(this._keys.right) - Number(this._keys.left);

		// Horizontal desired velocity from look direction (yaw only).
		let vx = 0;
		let vz = 0;

		if (forwardInput !== 0 || rightInput !== 0) {
			const yaw = this.object.rotation.y;

			_forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
			_right.set(Math.cos(yaw), 0, -Math.sin(yaw));

			_move.set(0, 0, 0);
			_move.addScaledVector(_forward, forwardInput);
			_move.addScaledVector(_right, rightInput);
			_move.normalize();

			const speed = this.walkSpeed * (this._keys.sprint ? this.walkSprintMultiplier : 1);
			vx = _move.x * speed;
			vz = _move.z * speed;
		}

		// Jump: launch velocity that reaches exactly jumpHeight under gravity.
		if (this._keys.up && this._onGround) {
			this._velocityY = Math.sqrt(2 * this.gravity * this.jumpHeight);
			this._onGround = false;
		}

		// Gravity (clamped so a single frame never skips through a block).
		this._velocityY -= this.gravity * delta;
		if (this._velocityY < -this.maxFallSpeed) this._velocityY = -this.maxFallSpeed;

		const pos = this.object.position;
		const hw = this.playerHalfWidth;
		const height = this.playerHeight;

		// Work in feet-space: the collider runs from feetY to feetY + height.
		let feetY = pos.y - this.eyeHeight;

		// --- Resolve each axis independently against the voxel grid. ---

		// X axis.
		pos.x += vx * delta;
		if (vx !== 0) {
			this._resolveHorizontal(pos, feetY, height, hw, 'x', vx);
		}

		// Z axis.
		pos.z += vz * delta;
		if (vz !== 0) {
			this._resolveHorizontal(pos, feetY, height, hw, 'z', vz);
		}

		// Y axis.
		feetY += this._velocityY * delta;
		feetY = this._resolveVertical(pos, feetY, height, hw);

		pos.y = feetY + this.eyeHeight;

	}

	// Snap the collider out of solid blocks along one horizontal axis.
	_resolveHorizontal(pos, feetY, height, hw, axis, vel) {

		const other = axis === 'x' ? 'z' : 'x';
		const yMin = blockIndex(feetY + COLLISION_SKIN);
		const yMax = blockIndex(feetY + height - COLLISION_SKIN);
		const oMin = blockIndex(pos[other] - hw + COLLISION_SKIN);
		const oMax = blockIndex(pos[other] + hw - COLLISION_SKIN);

		if (vel > 0) {
			const edge = pos[axis] + hw;
			const b = blockIndex(edge - 1e-6);
			if (this._anySolidStrip(axis, b, yMin, yMax, other, oMin, oMax)) {
				pos[axis] = (b - 0.5) - hw;
			}
		} else {
			const edge = pos[axis] - hw;
			const b = blockIndex(edge + 1e-6);
			if (this._anySolidStrip(axis, b, yMin, yMax, other, oMin, oMax)) {
				pos[axis] = (b + 0.5) + hw;
			}
		}

	}

	// Resolve gravity/jumping along Y; returns the corrected feet height.
	_resolveVertical(pos, feetY, height, hw) {

		const xMin = blockIndex(pos.x - hw + COLLISION_SKIN);
		const xMax = blockIndex(pos.x + hw - COLLISION_SKIN);
		const zMin = blockIndex(pos.z - hw + COLLISION_SKIN);
		const zMax = blockIndex(pos.z + hw - COLLISION_SKIN);

		this._onGround = false;

		if (this._velocityY <= 0) {
			// Moving down (or resting): test the block just beneath the feet.
			const by = blockIndex(feetY - 1e-4);
			if (this._anySolidColumn(by, xMin, xMax, zMin, zMax)) {
				feetY = by + 0.5;
				this._velocityY = 0;
				this._onGround = true;
			}
		} else {
			// Moving up: test the block at the head.
			const by = blockIndex(feetY + height - 1e-6);
			if (this._anySolidColumn(by, xMin, xMax, zMin, zMax)) {
				feetY = (by - 0.5) - height;
				this._velocityY = 0;
			}
		}

		return feetY;

	}

	// Any solid block in a vertical strip at a fixed primary-axis index?
	_anySolidStrip(axis, b, yMin, yMax, other, oMin, oMax) {

		for (let y = yMin; y <= yMax; y++) {
			for (let o = oMin; o <= oMax; o++) {
				const bx = axis === 'x' ? b : o;
				const bz = axis === 'x' ? o : b;
				if (isSolidAt(bx, y, bz)) return true;
			}
		}
		return false;

	}

	// Any solid block in a horizontal slab at a fixed Y index?
	_anySolidColumn(by, xMin, xMax, zMin, zMax) {

		for (let x = xMin; x <= xMax; x++) {
			for (let z = zMin; z <= zMax; z++) {
				if (isSolidAt(x, by, z)) return true;
			}
		}
		return false;

	}

	setMode(mode) {

		if (mode !== 'walk' && mode !== 'fly') return;
		this.mode = mode;
		this._velocityY = 0;
		this._onGround = false;

	}

	_clearKeys() {

		for (const key of Object.keys(this._keys)) {
			this._keys[key] = false;
		}

	}

}

function onClick() {

	this.lock();

}

function onMouseMove(event) {

	if (this.enabled === false || this.isLocked === false) return;

	_euler.setFromQuaternion(this.object.quaternion);
	_euler.y -= event.movementX * this.lookSpeed;
	_euler.x -= event.movementY * this.lookSpeed;
	_euler.x = Math.max(_PI_2 - this.maxPolarAngle, Math.min(_PI_2 - this.minPolarAngle, _euler.x));

	this.object.quaternion.setFromEuler(_euler);

}

function onPointerLockChange() {

	this.isLocked = document.pointerLockElement === this.domElement;

	if (!this.isLocked) {
		this._clearKeys();
	}

}

function onPointerLockError() {

	this.isLocked = false;

}

function onKeyDown(event) {

	if (this.enabled === false) return;

	switch (event.code) {
		case 'KeyW':
			this._keys.forward = true;
			break;
		case 'KeyS':
			this._keys.back = true;
			break;
		case 'KeyA':
			this._keys.left = true;
			break;
		case 'KeyD':
			this._keys.right = true;
			break;
		case 'Space':
			this._keys.up = true;
			break;
		case 'ShiftLeft':
		case 'ShiftRight':
			this._keys.down = true;
			break;
		case 'ControlLeft':
		case 'ControlRight':
			this._keys.sprint = true;
			break;
		default:
			return;
	}

	event.preventDefault();

}

function onKeyUp(event) {

	if (this.enabled === false) return;

	switch (event.code) {
		case 'KeyW':
			this._keys.forward = false;
			break;
		case 'KeyS':
			this._keys.back = false;
			break;
		case 'KeyA':
			this._keys.left = false;
			break;
		case 'KeyD':
			this._keys.right = false;
			break;
		case 'Space':
			this._keys.up = false;
			break;
		case 'ShiftLeft':
		case 'ShiftRight':
			this._keys.down = false;
			break;
		case 'ControlLeft':
		case 'ControlRight':
			this._keys.sprint = false;
			break;
		default:
			return;
	}

	event.preventDefault();

}

function onBlur() {

	this._clearKeys();

}

function onContextMenu(event) {

	event.preventDefault();

}

export { MinecraftControls };
