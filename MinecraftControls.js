import { Controls, Euler, Vector3 } from './three.r168.module.js';

const _changeEvent = { type: 'change' };
const _PI_2 = Math.PI / 2;
const _euler = new Euler(0, 0, 0, 'YXZ');
const _forward = new Vector3();
const _right = new Vector3();
const _move = new Vector3();

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
