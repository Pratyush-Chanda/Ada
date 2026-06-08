# Desmos Lock Test

---

## 🔓 `lock=none` — Full Editor Open
> You can type new expressions, delete existing ones, do anything.

```desmos lock=none height=380
y = x^2
```

---

## 🔒 `lock=expressions` — Sliders Free, Formulas Hidden
> Drag the sliders to feel the wave change — but you can't see or edit the formula.

```desmos lock=expressions height=420
a = 1
b = 1
c = 0
y = a\sin\left(bx+c\right)
```

---

## 🔐 `lock=sliders` — Everything Locked Except Pan/Zoom
> Sliders are frozen at their initial values. You can still pan and zoom.

```desmos lock=sliders height=420
a = 2
h = 1
k = -1
y = a\left(x-h\right)^2+k
```

---

## 🔏 `lock=all zoom=false` — Completely Static
> Nothing moves. Pure reference graph.

```desmos lock=all zoom=false height=350
y = e^x
y = \ln\left(x\right)
y = x
```

---

## 📐 Custom Heights Test
> Same graph, three different heights.

```desmos lock=expressions height=200
y = \sin\left(x\right)
```

```desmos lock=expressions height=400
y = \sin\left(x\right)
```

```desmos lock=expressions height=600
y = \sin\left(x\right)
```

---

## 🎛️ Slider Showcase — `lock=expressions`
> All sliders free. Try morphing the polar rose by dragging `n`.

```desmos lock=expressions height=450
n = 3
r = \cos\left(n\theta\right)
```

---

## 🥚 Easter Egg — Chaotic Beauties `lock=all`
> Completely frozen. Just stare at it.

```desmos lock=all zoom=false height=500
r = \sin\left(7\theta\right)+\cos\left(3\theta\right)
r = \sin\left(3\theta\right)\cos\left(5\theta\right)
x^2+y^2=\left(\sin\left(5\arctan\left(\frac{y}{x}\right)\right)+2\right)^2
```