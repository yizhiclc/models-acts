# 物理模型与数值方法

## 1. 时空与长度单位

使用 G=c=M=1，即长度单位 r_g=GM/c²；物理质量固定为 10^9 M_sun。采用无电荷、无自旋 Schwarzschild 外部度规：

```text
f(r) = 1 - 2/r
ds² = -f dt² + dr²/f + r²(dtheta² + sin²theta dvarphi²)
```

视界 r=2，光子球 r=3，ISCO r=6。非旋转黑洞具有球对称性，所以每条零测地线位于一个过原点的平面；平面极角 phi 不等于一般三维坐标中的方位角 varphi。

## 2. 有限距离相机与零测地线

OrbitControls 相机位于 r_obs>=48。每一帧把它看作相应位置的静止局域正交标架，不模拟观测者的运动多普勒效应。

```text
mu = ray_direction dot radial_unit
b = r_obs sqrt(1-mu²) / sqrt(f(r_obs))
u(0) = 1/r_obs
p(0) = du/dphi = -mu/b
du/dphi = p
dp/dphi = -u + 3u²
```

守恒关系：

```text
p² + u² - 2u³ = 1/b²
b_critical = 3 sqrt(3)
```

用四阶 Runge-Kutta 积分；标准/高精/极高角步长上限为 0.020/0.008/0.004 弧度。另限制单步径向变量的变化量，但没有把它冒充严格的局部误差控制器。

默认高精度模式；高精与极高使用每渲染像素4条子像素光线，对线性辐射强度求平均后再做显示变换。标准模式每像素1条光线并降低渲染分辨率。大屏采用轻微水平移轴取景，使参数面板不遮挡主要盘面。

三维位置：

```text
r_vector(phi) = [cos(phi) radial_unit + sin(phi) tangent_unit] / u(phi)
```

赤道交点的 phi 由解析三角关系确定，步长截断在交点处，再积分到交点，避免在厚度为零的盘上用粗糙线性空间插值。遇到盘内缘与外缘之间的第一个交点即截获光线：盘是双面、不透明、无限薄的。

u>=1/2.0001 时判为被俘获；u穿过0时用末步插值求渐近方向并采样无穷远背景。最多4096步，phi上限5pi。达到上限的未决临界光线显示为黑色，极窄高阶像可能因此受限。**没有预设屏幕黑圆或人为发光光子环**。

## 3. 盘动力学与频移

盘物质在赤道面作稳定圆测地线运动，r>=6：

```text
Omega = r^(-3/2)
u_em^t = 1/sqrt(1-3/r)
lambda = Lz/E = -b (radial_unit cross tangent_unit).y
g = nu_observed/nu_emitted
  = sqrt(1-3/r) / [sqrt(f(r_obs)) (1 - Omega lambda)]
```

lambda 的负号来自从观测者向场景反向追踪。g 同时包含引力红移、横向多普勒与纵向多普勒效应；不另叠加一个会重复计数的“相对论增亮”系数。

## 4. Novikov-Thorne 零内缘力矩薄盘

稳态、薄、各向同性局部黑体发射，ISCO 处力矩为零；不计算吸积演化。

令 x=sqrt(r)、x0=sqrt(6)，则 Schwarzschild 特例：

```text
I(r) = x - x0 - sqrt(3)/2 *
       ln[(x-sqrt(3))(x0+sqrt(3)) / ((x+sqrt(3))(x0-sqrt(3)))]

F_dimensionless(r) = 3 I(r) / [8 pi r^(5/2) (r-3)]
F_physical(r) = Mdot c^6/(G² M²) * F_dimensionless(r)
T_eff(r) = [F_physical(r)/sigma_SB]^(1/4)
```

这是单面局部出射通量。F(6)=0，通量峰值约在 r=9.55；远处回到 3GM Mdot/(8pi R³) 的主导项。默认参数的T峰值约1.9万K，因此内盘可见光偏白蓝，而不是人为强制橙色。

## 5. 辐射与颜色

Liouville 不变量 I_nu/nu³ 给出：

```text
I_nu,obs(nu) = g³ I_nu,em(nu/g)
B_nu 黑体 => T_obs = g T_eff
I_bol,obs = g⁴ I_bol,em
```

CPU 使用普朗克定律，在380–780nm范围按5nm采样，以 CIE 1931 匹配函数解析近似积分 XYZ，然后转线性sRGB。结果构建1024项对数温度LUT，覆盖500–200000K，GPU按T_obs取样。绝对显示亮度以20000K黑体的可见光Y值归一。

不单独归一化每个温度的颜色，因此可见光模式保留了普朗克谱本身的亮度变化。总辐射模式使用T_obs^4强度，色相为热谱提示；频移模式是诊断伪彩色。

最终曝光、ACES拟合色调映射、sRGB传递函数属于显示阶段，不是GR。没有额外bloom、伪造喷流或人为强制发光环。

星场为固定程序生成的稀疏天空纹理，经过相同光线追踪；不代表真实星表。背景源在无穷远，当前实现未给背景增加有限半径静止观测者的引力频率上移（默认半径约1.3%），也没有做星点自适应光束积分，因此星点放大与亚像素临界结构受采样限制。

## 6. 限制

- Schwarzschild而非Kerr；黑洞无自旋。
- 稳态测试盘，不是GRMHD；忽略盘自引力、厚度、磁场、散射、偏振、色修正、盘气体光谱线和回返辐射。
- 盘外缘是参数化截断，不是外部供质演化的结果。
- 缩放相机只改变静止观测者位置，无观测者运动效应。
- 对无限薄盘的严格共面视角是退化情况；近侧视预设使用87度而不是90度。
- 有限角步长和屏幕像素影响高阶像。选择高精/极高会显著增加GPU负载，不保证所有硬件实时。

## 7. 原始参考资料

- Page & Thorne (1974), “Disk-Accretion onto a Black Hole. Time-Averaged Structure of Accretion Disk”, Astrophysical Journal 191, 499–506. DOI: 10.1086/152990.
  https://articles.adsabs.harvard.edu/full/1974ApJ...191..499P
- Luminet (1979), “Image of a spherical black hole with thin accretion disk”, Astronomy and Astrophysics 75, 228–235. ADS: 1979A&A....75..228L.
  https://articles.adsabs.harvard.edu/full/1979A%26A....75..228L
- James, von Tunzelmann, Franklin & Thorne (2015), “Gravitational Lensing by Spinning Black Holes in Astrophysics, and in the Movie Interstellar”, Classical and Quantum Gravity 32, 065001. 本项目不实现该论文的Kerr光束追踪算法。
  https://arxiv.org/abs/1502.03808
- Wyman, Sloan & Shirley (2013), “Simple Analytic Approximations to the CIE XYZ Color Matching Functions”, Journal of Computer Graphics Techniques 2(2), 1–11.
  https://jcgt.org/published/0002/02/01/
- Three.js / OrbitControls official documentation.
  https://threejs.org/docs/#examples/en/controls/OrbitControls
